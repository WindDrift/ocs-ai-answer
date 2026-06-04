/**
 * LogsTab 组件 - 请求日志
 *
 * 包含：
 *   1. 日志列表（时间 / 题目 / 答案 / 耗时 + Token）
 *   2. 行展开后展示详细 Token 数据（输入 / 缓存命中 / 输出 / 总计）
 */
(function (global) {
  "use strict";

  const template = /* html */ `
<section>
  <div class="card overflow-hidden">
    <div class="card-header flex items-center justify-between flex-wrap gap-2">
      <div>
        <h3 class="card-title">近期请求记录</h3>
        <p class="card-sub">最多保留 200 条，点行可展开 Token 详细数据。</p>
      </div>
      <button @click="$emit('refresh')" class="btn-ghost btn-sm">刷新</button>
    </div>

    <div class="overflow-x-auto">
      <table class="log-table">
        <thead>
          <tr>
            <th class="w-10"></th>
            <th>时间</th>
            <th>题目信息</th>
            <th>状态 / 答案</th>
            <th>耗时 / Token</th>
          </tr>
        </thead>
        <tbody>
          <tr v-if="logs.length === 0">
            <td colspan="5" class="text-center text-slate-500 dark:text-slate-400 py-8">暂无请求记录</td>
          </tr>
          <template v-for="(log, index) in logs" :key="index">
            <tr class="log-row" :class="{ 'is-open': expanded[index] }" @click="toggle(index)">
              <td>
                <span class="expand-icon" :class="{ 'is-open': expanded[index] }">▸</span>
              </td>
              <td class="whitespace-nowrap text-slate-500 dark:text-slate-400">
                {{ formatTime(log.time) }}
              </td>
              <td class="log-question">
                <div class="font-medium truncate">{{ log.question }}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400 truncate" v-if="log.type || log.options">
                  {{ log.type }}<span v-if="log.type && log.options"> | </span>{{ log.options }}
                </div>
              </td>
              <td class="log-answer">
                <span v-if="log.error" class="text-red-600 dark:text-red-400" :title="log.error">{{ log.error }}</span>
                <span v-else class="text-emerald-600 dark:text-emerald-400" :title="log.answer">{{ log.answer }}</span>
              </td>
              <td class="whitespace-nowrap">
                <div v-if="!log.error" class="text-slate-700 dark:text-slate-300">
                  <span class="font-medium">{{ log.timeElapsed }}s</span>
                  <span class="text-xs text-slate-400 ml-1">({{ log.totalTokens }} tk)</span>
                </div>
                <div v-else class="text-red-500">-</div>
              </td>
            </tr>
            <tr v-if="expanded[index]" class="log-detail-row">
              <td colspan="5">
                <div class="log-detail">
                  <div class="token-grid">
                    <div class="token-cell">
                      <div class="token-label">输入 Token</div>
                      <div class="token-value">{{ tokensOf(index).input.toLocaleString() }}</div>
                    </div>
                    <div class="token-cell token-cell-accent">
                      <div class="token-label">输入命中缓存</div>
                      <div class="token-value">{{ tokensOf(index).cached.toLocaleString() }}</div>
                    </div>
                    <div class="token-cell">
                      <div class="token-label">输出 Token</div>
                      <div class="token-value">{{ tokensOf(index).output.toLocaleString() }}</div>
                    </div>
                    <div class="token-cell token-cell-total">
                      <div class="token-label">总 Token 消耗</div>
                      <div class="token-value">{{ tokensOf(index).total.toLocaleString() }}</div>
                    </div>
                  </div>
                  <div class="log-meta">
                    <span v-if="log.sessionId"><b>Session:</b> {{ log.sessionId }}</span>
                    <span v-if="log.turnIndex"><b>轮次:</b> {{ log.turnIndex }}</span>
                    <span v-if="log.course"><b>课程:</b> {{ log.course }}</span>
                    <span v-if="log.promptTokens"><b>未命中:</b> {{ (log.promptTokens - (log.promptCacheHitTokens || 0)).toLocaleString() }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </div>
  </div>
</section>
`;

  const LogsTab = {
    template,
    props: {
      logs: { type: Array, required: true },
    },
    emits: ["refresh"],
    data() {
      return { expanded: {} };
    },
    methods: {
      toggle(index) {
        this.expanded = { ...this.expanded, [index]: !this.expanded[index] };
      },
      formatTime(t) {
        if (!t) return "-";
        const d = new Date(t);
        return isNaN(d.getTime()) ? "-" : d.toLocaleTimeString();
      },
      tokensOf(index) {
        return Stats.formatLogTokens(this.logs[index]);
      },
    },
  };

  global.LogsTab = LogsTab;
})(window);
