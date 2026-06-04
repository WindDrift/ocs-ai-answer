/**
 * SettingsTab 组件 - AI 设置
 *
 * 包含：
 *   1. 配置档案切换（顶部卡片，含下拉/激活徽标/确认弹窗/历史时间线）
 *   2. API Base URL 预设下拉（含 4 家厂商 + 控制台跳转）
 *   3. 完整 AI 参数配置（按 AIParams.groups 动态分组渲染）
 *   4. 服务端口配置
 *   5. 参数保存与重置
 */
(function (global) {
  "use strict";

  const template = /* html */ `
<section>
  <!-- ============== 配置档案 ============== -->
  <div class="card profile-card">
    <div class="card-header">
      <h3 class="card-title">配置档案</h3>
      <p class="card-sub">在多套预设配置间一键切换，切换后立即生效。</p>
    </div>

    <div class="profile-grid">
      <div>
        <label class="form-label">选择档案</label>
        <div class="profile-select-row">
          <select v-model="selectedProfileName" :disabled="isSwitching" class="form-select">
            <option v-for="p in profiles" :key="p.name" :value="p.name">
              {{ p.name }}{{ p.name === activeProfileName ? '（当前激活）' : '' }}
            </option>
          </select>
          <button
            type="button"
            @click="onSwitchClick"
            :disabled="!canSwitch"
            :class="['btn-primary', 'btn-sm', isSwitching ? 'is-loading' : '']">
            <span v-if="isSwitching">切换中…</span>
            <span v-else>一键切换</span>
          </button>
        </div>
        <p class="form-hint" v-if="selectedProfile && selectedProfile.description">
          {{ selectedProfile.description }}
        </p>
        <p class="form-hint" v-else>选择后点击"一键切换"应用此档案。</p>
      </div>

      <div>
        <label class="form-label">最近切换</label>
        <ul class="profile-timeline" v-if="profileHistory.length">
          <li v-for="(h, i) in profileHistory.slice(0, 5)" :key="i" class="profile-timeline-item">
            <span class="profile-timeline-dot" :class="h.success ? 'is-success' : 'is-fail'"></span>
            <span class="profile-timeline-text">
              <span class="profile-timeline-from">{{ h.from || '—' }}</span>
              <span class="profile-timeline-arrow">→</span>
              <span class="profile-timeline-to">{{ h.to }}</span>
            </span>
            <span class="profile-timeline-time">{{ formatRelativeTime(h.time) }}</span>
          </li>
        </ul>
        <div v-else class="profile-timeline-empty">暂无切换记录</div>
      </div>
    </div>
  </div>

  <div class="card">
    <div class="card-header">
      <h3 class="card-title">AI 参数设置</h3>
      <p class="card-sub">配置 API 地址、模型与所有 AI 调用参数，保存后立即生效。</p>
    </div>

    <form @submit.prevent="onSave" class="space-y-6">
      <!-- ============== API Base URL 预设区 ============== -->
      <div class="setting-section">
        <h4 class="setting-section-title">API Base URL 预设</h4>
        <div class="preset-grid">
          <div>
            <label class="form-label">选择预设服务商</label>
            <select v-model="selectedProvider" @change="onProviderChange" class="form-select" :class="{ 'is-active': selectedProvider !== '__custom' }">
              <option value="__custom">— 自定义 URL —</option>
              <option v-for="p in providers" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <p class="form-hint">选择后会自动填入对应 API 地址，仍可手动调整。</p>
          </div>
          <div>
            <label class="form-label">服务商控制台</label>
            <div v-if="currentProvider" class="flex items-center gap-2">
              <a :href="currentProvider.console" target="_blank" rel="noopener" class="btn-outline btn-sm">
                打开 {{ currentProvider.name }} 控制台
                <span class="external-icon">↗</span>
              </a>
            </div>
            <div v-else class="text-sm text-slate-500">当前为自定义 URL，无控制台跳转</div>
          </div>
        </div>

        <div class="mt-4">
          <label class="form-label flex items-center justify-between">
            <span>API Base URL</span>
            <span v-if="isUrlAutoFilled" class="auto-fill-tag">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
              </svg>
              已自动填入
            </span>
          </label>
          <input
            type="text"
            v-model="editConfig.ai.apiBase"
            @input="onUrlInput"
            class="form-input"
            :class="{ 'is-auto': isUrlAutoFilled }"
            placeholder="如：https://api.openai.com/v1"
            required>
          <p class="form-hint">OpenAI 兼容 API 入口地址，系统会自动拼接 /chat/completions。</p>
        </div>
      </div>

      <!-- ============== 参数分组 ============== -->
      <template v-for="group in groups" :key="group.id">
        <div class="setting-section">
          <h4 class="setting-section-title">{{ group.label }}</h4>
          <div class="param-grid">
            <div v-for="p in paramsByGroup(group.id)" :key="p.key" :class="['param-cell', p.type === 'textarea' || p.type === 'json' ? 'param-cell-full' : '']">
              <label class="form-label">
                {{ p.label }}
                <span v-if="p.required" class="text-red-500">*</span>
              </label>

              <!-- 文本输入 -->
              <input
                v-if="p.type === 'text' || p.type === 'password'"
                :type="p.type"
                v-model="editConfig.ai[p.key]"
                class="form-input"
                :placeholder="p.placeholder"
                :required="!!p.required">

              <!-- 数字输入 -->
              <input
                v-else-if="p.type === 'number'"
                type="number"
                v-model.number="editConfig.ai[p.key]"
                class="form-input"
                :placeholder="p.placeholder"
                :min="p.min"
                :max="p.max"
                :step="p.step">

              <!-- 下拉选择 -->
              <select
                v-else-if="p.type === 'select'"
                v-model="editConfig.ai[p.key]"
                class="form-select">
                <option v-for="opt in p.options" :key="String(opt.value)" :value="opt.value">{{ opt.label }}</option>
              </select>

              <!-- 布尔 -->
              <label v-else-if="p.type === 'boolean'" class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" v-model="editConfig.ai[p.key]" class="form-checkbox">
                <span class="text-sm text-slate-600 dark:text-slate-300">启用</span>
              </label>

              <!-- JSON -->
              <textarea
                v-else-if="p.type === 'json'"
                rows="2"
                :value="jsonFieldValue(p.key)"
                @input="onJsonInput(p.key, $event)"
                class="form-textarea font-mono text-xs"
                :placeholder="p.placeholder"></textarea>

              <!-- 多行文本 -->
              <textarea
                v-else-if="p.type === 'textarea'"
                rows="3"
                v-model="editConfig.ai[p.key]"
                class="form-textarea"
                :placeholder="p.placeholder"></textarea>

              <!-- 提示信息 -->
              <p v-if="p.tip" class="form-hint" :class="{ 'form-hint-warn': p.key === 'temperature' || p.key === 'topP' }">{{ p.tip }}</p>
            </div>
          </div>
        </div>
      </template>

      <!-- ============== 服务端口 ============== -->
      <div class="setting-section">
        <h4 class="setting-section-title">服务端口</h4>
        <div class="param-grid">
          <div class="param-cell">
            <label class="form-label">服务端口 (重启生效)</label>
            <input type="number" v-model.number="editConfig.port" class="form-input">
            <p class="form-hint">修改后需重启 Node.js 进程才能生效。</p>
          </div>
        </div>
      </div>

      <!-- ============== 操作按钮 ============== -->
      <div class="form-actions">
        <button type="button" @click="onReset" class="btn-ghost">重置</button>
        <button type="submit" class="btn-primary">保存设置</button>
      </div>
    </form>
  </div>

  <!-- ============== 切换确认弹窗 ============== -->
  <transition name="fade">
    <div v-if="showSwitchConfirm" class="switch-confirm-mask" @click.self="cancelSwitch">
      <div class="switch-confirm-dialog" role="dialog" aria-modal="true">
        <h4 class="switch-confirm-title">确认切换配置档案</h4>
        <p class="switch-confirm-body">
          将从 <strong>{{ activeProfileName }}</strong> 切换到 <strong>{{ selectedProfileName }}</strong>。
        </p>
        <p class="switch-confirm-warn" v-if="hasUnsavedChanges">
          ⚠ 当前编辑区有未保存的修改，切换后将丢失。
        </p>
        <p class="switch-confirm-warn" v-else>
          切换后 AI 调用将立即使用新配置。
        </p>
        <div class="switch-confirm-actions">
          <button type="button" @click="cancelSwitch" class="btn-ghost btn-sm">取消</button>
          <button type="button" @click="confirmSwitch" class="btn-primary btn-sm" :disabled="isSwitching">
            {{ isSwitching ? '切换中…' : '确认切换' }}
          </button>
        </div>
      </div>
    </div>
  </transition>
</section>
`;

  /**
   * 将 ISO 时间字符串格式化为相对时间（"刚刚"/"3 分钟前"/"2 小时前"/"2026-06-04"）
   * @param {string} iso
   * @returns {string}
   */
  function formatRelativeTime(iso) {
    if (!iso) return "";
    const t = new Date(iso).getTime();
    if (isNaN(t)) return "";
    const diff = Date.now() - t;
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + " 小时前";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const SettingsTab = {
    template,
    props: {
      editConfig: { type: Object, required: true },
      profiles: { type: Array, default: () => [] },
      activeProfileName: { type: String, default: "default" },
      profileHistory: { type: Array, default: () => [] },
    },
    emits: ["save", "reset", "switch-profile", "show-toast", "reload-config"],
    data() {
      return {
        selectedProvider: "__custom",
        isUrlAutoFilled: false,
        selectedProfileName: this.activeProfileName,
        isSwitching: false,
        showSwitchConfirm: false,
        hasUnsavedChanges: false,
      };
    },
    computed: {
      providers() {
        return Providers.providers;
      },
      groups() {
        return AIParams.groups;
      },
      currentProvider() {
        if (this.selectedProvider === "__custom") return null;
        return Providers.providers.find((p) => p.id === this.selectedProvider) || null;
      },
      selectedProfile() {
        return this.profiles.find((p) => p.name === this.selectedProfileName) || null;
      },
      canSwitch() {
        if (this.isSwitching) return false;
        if (!this.selectedProfileName) return false;
        if (this.selectedProfileName === this.activeProfileName) return false;
        if (!this.profiles.some((p) => p.name === this.selectedProfileName)) return false;
        return true;
      },
    },
    watch: {
      "editConfig.ai.apiBase": {
        immediate: true,
        handler(val) {
          // 当外部数据变化时尝试匹配预设
          const matched = Providers.matchByUrl(val);
          if (matched) {
            this.selectedProvider = matched.id;
            this.isUrlAutoFilled = false; // 初始时不算自动填入
          } else {
            this.selectedProvider = "__custom";
            this.isUrlAutoFilled = false;
          }
        },
      },
      activeProfileName(newVal) {
        // 父组件刷新时同步下拉选中
        this.selectedProfileName = newVal;
      },
      editConfig: {
        deep: true,
        handler() {
          this.hasUnsavedChanges = true;
        },
      },
    },
    methods: {
      /**
       * 按分组获取参数定义
       * @param {string} groupId
       * @returns {Array}
       */
      paramsByGroup(groupId) {
        return AIParams.params.filter((p) => p.group === groupId);
      },

      /**
       * 预设选择变化时，回填 API URL 并标记为自动填入
       */
      onProviderChange() {
        if (this.selectedProvider === "__custom") {
          this.isUrlAutoFilled = false;
          return;
        }
        const p = Providers.providers.find((x) => x.id === this.selectedProvider);
        if (p) {
          this.editConfig.ai.apiBase = p.apiBase;
          this.isUrlAutoFilled = true;
        }
      },

      /**
       * 用户手动修改 URL 时，取消自动填入标记
       */
      onUrlInput() {
        this.isUrlAutoFilled = false;
      },

      /**
       * JSON 字段显示：null 显示空字符串，对象显示 JSON 字符串
       * @param {string} key
       * @returns {string}
       */
      jsonFieldValue(key) {
        const v = this.editConfig.ai[key];
        if (v == null) return "";
        return typeof v === "string" ? v : JSON.stringify(v, null, 2);
      },

      /**
       * JSON 字段输入：解析失败保留原始字符串
       * @param {string} key
       * @param {Event} e
       */
      onJsonInput(key, e) {
        const raw = e.target.value;
        if (!raw.trim()) {
          this.editConfig.ai[key] = null;
          return;
        }
        try {
          this.editConfig.ai[key] = JSON.parse(raw);
        } catch (_) {
          this.editConfig.ai[key] = raw;
        }
      },

      onSave() {
        // 预处理数字和 null
        const payload = JSON.parse(JSON.stringify(this.editConfig));
        for (const k in payload.ai) {
          if (payload.ai[k] === "") payload.ai[k] = null;
        }
        this.$emit("save", payload);
        this.hasUnsavedChanges = false;
      },

      onReset() {
        this.isUrlAutoFilled = false;
        this.selectedProvider = "__custom";
        this.hasUnsavedChanges = false;
        this.$emit("reset");
      },

      /**
       * 点击"一键切换"按钮：弹出确认弹窗
       */
      onSwitchClick() {
        if (!this.canSwitch) return;
        this.showSwitchConfirm = true;
      },

      cancelSwitch() {
        if (this.isSwitching) return;
        this.showSwitchConfirm = false;
        // 取消时把下拉选回当前激活档案
        this.selectedProfileName = this.activeProfileName;
      },

      /**
       * 确认切换：调用后端接口，成功后通知父组件刷新
       */
      async confirmSwitch() {
        if (this.isSwitching) return;
        this.isSwitching = true;
        try {
          const target = this.selectedProfileName;
          this.$emit("switch-profile", target, async (success, msg) => {
            this.isSwitching = false;
            this.showSwitchConfirm = false;
            if (success) {
              this.hasUnsavedChanges = false;
              this.$emit("show-toast", msg || "切换成功", "success");
              this.$emit("reload-config");
            } else {
              this.selectedProfileName = this.activeProfileName;
              this.$emit("show-toast", msg || "切换失败", "error");
            }
            // 防抖：1 秒内禁用按钮
            setTimeout(() => { this.isSwitching = false; }, 1000);
          });
        } catch (e) {
          this.isSwitching = false;
          this.showSwitchConfirm = false;
          this.$emit("show-toast", e.message || "切换失败", "error");
        }
      },

      /**
       * 格式化相对时间（暴露给模板）
       */
      formatRelativeTime,
    },
  };

  global.SettingsTab = SettingsTab;
})(window);