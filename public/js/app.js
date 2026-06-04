/**
 * Vue 主应用入口
 *
 * 负责：
 *   - 整合 HomeTab / SettingsTab / LogsTab 三个页面
 *   - 调度 API 调用与状态管理
 *   - 主题切换（深色/浅色）
 *   - Toast 通知
 *
 * 依赖（在 index.html 中按顺序加载）：
 *   window.Providers / window.AIParams / window.Stats / window.API / window.SvgChart
 *   window.HomeTab / window.SettingsTab / window.LogsTab
 */
(function (global) {
  "use strict";

  const { createApp, ref, reactive, onMounted, watch, computed, provide } = Vue;

  const rootTemplate = /* html */ `
<div v-cloak class="app-shell">
  <!-- 顶部导航 -->
  <nav class="app-nav">
    <div class="nav-inner">
      <div class="nav-left">
        <div class="brand">
          <span class="brand-dot"></span>
          <h1 class="brand-name">OCS AI 答题服务</h1>
        </div>
        <div class="nav-tabs">
          <button @click="currentTab = 'home'" :class="['nav-tab', currentTab === 'home' ? 'is-active' : '']">
            <span class="tab-icon">▣</span>概览与配置
          </button>
          <button @click="currentTab = 'settings'" :class="['nav-tab', currentTab === 'settings' ? 'is-active' : '']">
            <span class="tab-icon">⚙</span>AI 设置
          </button>
          <button @click="currentTab = 'logs'" :class="['nav-tab', currentTab === 'logs' ? 'is-active' : '']">
            <span class="tab-icon">≡</span>请求日志
          </button>
        </div>
      </div>
      <div class="nav-right">
        <button @click="toggleDarkMode" class="icon-btn" :title="isDarkMode ? '切换为浅色' : '切换为深色'">
          <span v-if="isDarkMode">☀</span>
          <span v-else>☾</span>
        </button>
      </div>
    </div>
  </nav>

  <!-- 主区 -->
  <main class="app-main">
    <!-- Toast -->
    <transition name="toast">
      <div v-if="toast.show" :class="['toast', toast.type === 'success' ? 'toast-success' : 'toast-error']" role="alert">
        {{ toast.message }}
      </div>
    </transition>

    <!-- 三个 Tab -->
    <home-tab
      v-show="currentTab === 'home'"
      :config="config"
      :logs="logs"
      :ocs-config-str="ocsConfigStr"
      :provider-name="providerName"
      :provider-color="providerColor"
      :api-base="apiBase"
      :today-stats="todayStats"
      :range-stats="rangeStats"
      :time-window="timeWindow"
      @copy-config="copyOcsConfig"
      @refresh-today="fetchTodayStats"
      @change-window="onChangeWindow">
    </home-tab>

    <settings-tab
      v-show="currentTab === 'settings'"
      :edit-config="editConfig"
      :profiles="profiles"
      :active-profile-name="activeProfileName"
      :profile-history="profileHistory"
      @save="saveConfig"
      @reset="fetchConfig"
      @switch-profile="handleSwitchProfile"
      @show-toast="showToast"
      @reload-config="fetchConfig">
    </settings-tab>

    <logs-tab
      v-show="currentTab === 'logs'"
      :logs="logs"
      @refresh="fetchLogs">
    </logs-tab>
  </main>

  <footer class="app-footer">
    <span>OCS AI 答题服务 · 控制面板 v2.0</span>
    <span class="footer-dot">·</span>
    <span>模块化重构版</span>
  </footer>
</div>
`;

  const app = createApp({
    template: rootTemplate,
    components: {
      HomeTab: global.HomeTab,
      SettingsTab: global.SettingsTab,
      LogsTab: global.LogsTab,
    },
    setup() {
      const currentTab = ref("home");
      const config = ref({});
      const editConfig = reactive({ ai: {} });
      const ocsConfigStr = ref("");
      const logs = ref([]);
      const todayStats = ref(null);
      const rangeStats = ref(null);
      const timeWindow = ref("24h");
      // 配置档案状态（由 fetchProfiles 填充）
      const profiles = ref([]);
      const activeProfileName = ref("default");
      const profileHistory = ref([]);
      const toast = reactive({ show: false, message: "", type: "success" });
      const isDarkMode = ref(false);

      // 服务商信息
      const apiBase = computed(() => (config.value && config.value.ai && config.value.ai.apiBase) || "");
      const providerName = computed(() => {
        const det = Providers.detectProvider(apiBase.value);
        return det.name;
      });
      const providerColor = computed(() => {
        const det = Providers.detectProvider(apiBase.value);
        return det.provider ? det.provider.color : "#64748b";
      });

      const showToast = (message, type = "success") => {
        toast.message = message;
        toast.type = type;
        toast.show = true;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.show = false; }, 3000);
      };

      const fetchConfig = async () => {
        const res = await API.getConfig();
        if (res.code === 1) {
          config.value = res.data;
          // 深拷贝到 editConfig
          const copy = JSON.parse(JSON.stringify(res.data));
          Object.assign(editConfig, copy);
          if (!editConfig.ai) editConfig.ai = {};
          // 兜底默认字段
          if (!("temperature" in editConfig.ai)) editConfig.ai.temperature = null;
          if (!("topP" in editConfig.ai)) editConfig.ai.topP = null;
        } else {
          showToast("获取配置失败: " + (res.msg || ""), "error");
        }
      };

      /**
       * 拉取档案列表 + 当前激活 + 切换历史
       * 与 fetchConfig 并行调用，不阻塞页面渲染
       */
      const fetchProfiles = async () => {
        const res = await API.getProfiles();
        if (res.code === 1 && res.data) {
          profiles.value = res.data.profiles || [];
          activeProfileName.value = res.data.activeProfile || "default";
          profileHistory.value = res.data.history || [];
        }
      };

      /**
       * 切换配置档案：调后端接口，成功后双源刷新（档案+配置）
       * 回调 cb(success, msg) 由 SettingsTab 传入，用于关闭确认弹窗
       */
      const handleSwitchProfile = async (name, cb) => {
        const res = await API.switchProfile(name);
        if (res.code === 1) {
          // 切换成功：刷新档案列表（含新历史）+ 主配置 + OCS 配置
          await Promise.all([fetchProfiles(), fetchConfig(), fetchOcsConfig()]);
          if (typeof cb === "function") cb(true, res.msg);
        } else {
          if (typeof cb === "function") cb(false, res.msg);
        }
      };

      const fetchOcsConfig = async () => {
        const res = await API.getOcsConfig();
        if (res.code === 1) {
          ocsConfigStr.value = JSON.stringify(res.data, null, 2);
        }
      };

      const fetchLogs = async () => {
        const res = await API.getLogs();
        if (res.code === 1) {
          logs.value = res.data || [];
        }
      };

      const fetchTodayStats = async () => {
        const res = await API.getTodayStats();
        if (res.code === 1) {
          todayStats.value = Stats.formatToday(res.data);
        }
      };

      const fetchRangeStats = async (window) => {
        const key = window || timeWindow.value || "24h";
        const res = await API.getRangeStats(key);
        if (res.code === 1) {
          rangeStats.value = Stats.formatRange(res.data);
        }
      };

      const onChangeWindow = (window) => {
        timeWindow.value = window;
        fetchRangeStats(window);
      };

      const saveConfig = async (payload) => {
        const res = await API.saveConfig(payload);
        if (res.code === 1) {
          showToast("配置保存成功");
          await fetchConfig();
        } else {
          showToast(res.msg || "保存失败", "error");
        }
      };

      const copyOcsConfig = async () => {
        try {
          await navigator.clipboard.writeText(ocsConfigStr.value);
          showToast("配置已复制到剪贴板");
        } catch (_) {
          // 兜底：使用 textarea + execCommand
          const ta = document.createElement("textarea");
          ta.value = ocsConfigStr.value;
          document.body.appendChild(ta);
          ta.select();
          try {
            document.execCommand("copy");
            showToast("配置已复制到剪贴板");
          } catch (e) {
            showToast("复制失败，请手动复制", "error");
          }
          document.body.removeChild(ta);
        }
      };

      const toggleDarkMode = () => {
        isDarkMode.value = !isDarkMode.value;
      };

      watch(isDarkMode, (val) => {
        if (val) {
          document.documentElement.classList.add("dark");
          localStorage.setItem("theme", "dark");
        } else {
          document.documentElement.classList.remove("dark");
          localStorage.setItem("theme", "light");
        }
      });

      const initTheme = () => {
        if (localStorage.getItem("theme") === "dark" || (!("theme" in localStorage) && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
          isDarkMode.value = true;
        }
      };

      onMounted(() => {
        initTheme();
        // 并行拉取配置与档案列表，提升首屏速度
        Promise.all([fetchConfig(), fetchOcsConfig(), fetchLogs(), fetchProfiles(), fetchTodayStats(), fetchRangeStats()]);

        // 定时刷新日志（仅在 logs tab 时刷新）+ 今日数据
        setInterval(() => {
          if (currentTab.value === "logs") {
            fetchLogs();
          }
          // 今日数据每 10 秒刷新一次
          if (Date.now() % 10000 < 5000) {
            fetchTodayStats();
            fetchRangeStats();
          }
        }, 5000);
      });

      return {
        currentTab,
        config,
        editConfig,
        ocsConfigStr,
        logs,
        todayStats,
        rangeStats,
        timeWindow,
        toast,
        isDarkMode,
        profiles,
        activeProfileName,
        profileHistory,
        apiBase,
        providerName,
        providerColor,
        toggleDarkMode,
        saveConfig,
        copyOcsConfig,
        fetchConfig,
        fetchLogs,
        fetchTodayStats,
        fetchRangeStats,
        onChangeWindow,
        handleSwitchProfile,
        showToast,
      };
    },
  });

  app.mount("#app");
})(window);
