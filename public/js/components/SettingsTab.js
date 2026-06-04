/**
 * SettingsTab 组件 - AI 设置
 *
 * 包含：
 *   1. API Base URL 预设下拉（含 4 家厂商 + 控制台跳转）
 *   2. 完整 AI 参数配置（按 AIParams.groups 动态分组渲染）
 *   3. 服务端口配置
 *   4. 参数保存与重置
 */
(function (global) {
  "use strict";

  const template = /* html */ `
<section>
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
</section>
`;

  const SettingsTab = {
    template,
    props: {
      editConfig: { type: Object, required: true },
    },
    emits: ["save", "reset"],
    data() {
      return {
        selectedProvider: "__custom",
        isUrlAutoFilled: false,
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
      },

      onReset() {
        this.isUrlAutoFilled = false;
        this.selectedProvider = "__custom";
        this.$emit("reset");
      },
    },
  };

  global.SettingsTab = SettingsTab;
})(window);
