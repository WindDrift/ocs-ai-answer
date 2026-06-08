/**
 * Vue 主应用入口
 *
 * 负责：
 *   - 整合 HomeTab / SettingsTab / LogsTab 三个页面
 *   - 通过 composables（useConfig / useStats / useProfiles）管理 API 状态
 *   - 主题切换（深色/浅色）
 *   - Toast 通知
 *
 * 依赖（在 index.html 中按顺序加载）：
 *   window.Providers / window.AIParams / window.Stats / window.API / window.SvgChart
 *   window.useConfig / window.useStats / window.useProfiles
 *   window.HomeTab / window.SettingsTab / window.LogsTab
 */
(function (global) {
  "use strict";

  const { createApp, ref, reactive, onMounted, watch, computed } = Vue;

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
      @reload-config="fetchConfig"
      @save-to-profile="handleSaveToProfile"
      @create-new-profile="handleCreateNewProfile">
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
      /* ========== 状态定义 ========== */
      const currentTab = ref("home");
      const config = ref({});
      const editConfig = reactive({ ai: {} });
      const ocsConfigStr = ref("");
      const logs = ref([]);
      const todayStats = ref(null);
      const rangeStats = ref(null);
      const timeWindow = ref("24h");
      const profiles = ref([]);
      const activeProfileName = ref("default");
      const profileHistory = ref([]);
      const toast = reactive({ show: false, message: "", type: "success" });
      const isDarkMode = ref(false);

      /* ========== 计算属性 ========== */
      const apiBase = computed(() => (config.value && config.value.ai && config.value.ai.apiBase) || "");
      const providerName = computed(() => Providers.detectProvider(apiBase.value).name);
      const providerColor = computed(() => {
        const det = Providers.detectProvider(apiBase.value);
        return det.provider ? det.provider.color : "#64748b";
      });

      /* ========== 工具方法 ========== */
      const showToast = (message, type = "success") => {
        toast.message = message;
        toast.type = type;
        toast.show = true;
        clearTimeout(showToast._t);
        showToast._t = setTimeout(() => { toast.show = false; }, 3000);
      };

      /* ========== composables 组合 ========== */
      // useConfig: 配置读写
      const { fetchConfig, saveConfig } = global.useConfig({ config, editConfig, showToast });

      // useStats: 统计 / 日志 / OCS 配置
      const {
        fetchLogs,
        fetchTodayStats,
        fetchRangeStats,
        onChangeWindow,
        fetchOcsConfig,
      } = global.useStats({ logs, todayStats, rangeStats, ocsConfigStr, timeWindow });

      // useProfiles: 档案拉取 / 切换 / 保存 / 创建
      // 切换或创建档案成功后，需要刷新配置 + OCS 配置
      const onProfileChanged = async () => {
        await Promise.all([fetchConfig(), fetchOcsConfig()]);
      };
      const {
        fetchProfiles,
        switchProfile,
        saveToProfile,
        createNewProfile,
      } = global.useProfiles({
        profiles,
        activeProfileName,
        profileHistory,
        onAfterChange: onProfileChanged,
      });

      // 包装：把 composable 的方法暴露为命名 handler 供模板调用
      const handleSwitchProfile = (name, cb) => switchProfile(name, cb);
      const handleSaveToProfile = (payload, cb) => saveToProfile(payload, cb);
      const handleCreateNewProfile = (payload, cb) => createNewProfile(payload, cb);

      /* ========== 剪贴板 / 主题 ========== */
      const copyOcsConfig = async () => {
        try {
          await navigator.clipboard.writeText(ocsConfigStr.value);
          showToast("配置已复制到剪贴板");
        } catch (_) {
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

      /* ========== 启动 ========== */
      onMounted(() => {
        initTheme();
        Promise.all([
          fetchConfig(),
          fetchOcsConfig(),
          fetchLogs(),
          fetchProfiles(),
          fetchTodayStats(),
          fetchRangeStats(),
        ]);

        // 定时刷新：仅在当前 tab 需要时拉取，切到非活动 tab 暂停
        setInterval(() => {
          if (currentTab.value === "logs") fetchLogs();
          if (currentTab.value === "home") {
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
        handleSaveToProfile,
        handleCreateNewProfile,
        showToast,
      };
    },
  });

  app.mount("#app");
})(window);
