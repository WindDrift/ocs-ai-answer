/**
 * HomeTab 组件 - 概览与配置
 *
 * 包含三大板块：
 *   1. OCS 题库配置（一键复制）
 *   2. 服务状态（当前服务商 / 模型 / 日志条数 / 当前端口兼容保留）
 *   3. 今日数据统计（6 个核心指标 + 24h 趋势图）
 */
(function (global) {
  "use strict";

  const template = /* html */ `
<section class="space-y-6">
  <!-- OCS 题库配置 -->
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">OCS 题库配置</h3>
      <p class="card-sub">一键复制下方配置，在 OCS 网课助手的题库配置页粘贴即可使用。</p>
    </div>
    <div class="relative">
      <textarea readonly rows="10" class="config-textarea">{{ ocsConfigStr }}</textarea>
      <button @click="copyOcsConfig" class="btn-primary btn-sm absolute top-2 right-2">一键复制</button>
    </div>
  </div>

  <!-- 服务状态 -->
  <div class="card">
    <div class="card-header">
      <h3 class="card-title">服务状态</h3>
    </div>
    <div class="stat-grid">
      <div class="stat-card stat-card-primary">
        <div class="stat-label">当前服务商</div>
        <div class="stat-value-row">
          <span class="provider-badge" :style="{ background: providerColor }">{{ providerName }}</span>
        </div>
        <div class="stat-foot" v-if="apiBase">{{ apiBase }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">当前模型</div>
        <div class="stat-value" :title="config.ai?.model">{{ config.ai?.model || '未知' }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">日志条数</div>
        <div class="stat-value">{{ logs.length }}</div>
      </div>
    </div>
  </div>

  <!-- 今日数据 -->
  <div class="card">
    <div class="card-header flex items-center justify-between flex-wrap gap-2">
      <div>
        <h3 class="card-title">今日数据</h3>
        <p class="card-sub">按本地时区聚合，{{ todayStats?.date || '—' }}</p>
      </div>
      <button @click="refreshToday" class="btn-ghost btn-sm">刷新</button>
    </div>

    <div v-if="!todayStats" class="empty-state">加载中...</div>
    <template v-else>
      <!-- 6 项核心指标（平均值合并到主数据底部） -->
      <div class="metric-grid">
        <div class="metric-cell">
          <div class="metric-label">请求总数量</div>
          <div class="metric-value">{{ todayStats.requestCount }}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">输入 Token</div>
          <div class="metric-value">{{ todayStats.promptTokens }}</div>
          <div class="metric-foot">平均每题 {{ todayStats.averageInputTokens }} · 命中 {{ todayStats.cachedTokens }} / 未命中 {{ todayStats.uncachedTokens }}</div>
        </div>
        <div class="metric-cell metric-cell-accent">
          <div class="metric-label">缓存命中率</div>
          <div class="metric-value">{{ todayStats.cacheHitRate }}</div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ width: (todayStats.cacheHitRateValue * 100) + '%' }"></div>
          </div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">输出 Token</div>
          <div class="metric-value">{{ todayStats.completionTokens }}</div>
          <div class="metric-foot">平均每题 {{ todayStats.averageOutputTokens }}</div>
        </div>
        <div class="metric-cell metric-cell-total">
          <div class="metric-label">总 Token 消耗</div>
          <div class="metric-value">{{ todayStats.totalTokens }}</div>
        </div>
        <div class="metric-cell">
          <div class="metric-label">总耗时</div>
          <div class="metric-value">{{ todayStats.totalTimeText }}</div>
          <div class="metric-foot">平均每题 {{ todayStats.averageTimeSec }} 秒 · ≈ {{ todayStats.totalTimeMin }} 分钟</div>
        </div>
      </div>

      <!-- 趋势图 + 时段切换 -->
      <div class="trend-section">
        <div class="trend-toolbar">
          <span class="trend-toolbar-label">趋势时段</span>
          <div class="trend-window-group">
            <button
              v-for="opt in windowOptions"
              :key="opt.key"
              @click="changeWindow(opt.key)"
              :class="['trend-window-btn', timeWindow === opt.key ? 'is-active' : '']">
              {{ opt.label }}
            </button>
          </div>
        </div>
        <div v-if="!rangeStats" class="empty-state">趋势加载中...</div>
        <template v-else>
          <div class="trend-grid">
            <div class="trend-card">
              <div class="trend-title">{{ rangeStats.windowLabel }} 请求数趋势</div>
              <div v-html="requestChartSvg" class="trend-svg"></div>
            </div>
            <div class="trend-card">
              <div class="trend-title">{{ rangeStats.windowLabel }} Token 消耗趋势</div>
              <div v-html="tokenChartSvg" class="trend-svg"></div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </div>
</section>
`;

  const WINDOW_OPTIONS = [
    { key: "5m",  label: "近5分钟" },
    { key: "30m", label: "近30分钟" },
    { key: "1h",  label: "近1小时" },
    { key: "3h",  label: "近3小时" },
    { key: "12h", label: "近12小时" },
    { key: "24h", label: "近24小时" },
  ];

  const HomeTab = {
    template,
    props: {
      config: { type: Object, required: true },
      logs: { type: Array, required: true },
      ocsConfigStr: { type: String, required: true },
      providerName: { type: String, required: true },
      providerColor: { type: String, required: true },
      apiBase: { type: String, required: true },
      todayStats: { type: Object, default: null },
      rangeStats: { type: Object, default: null },
      timeWindow: { type: String, default: "24h" },
    },
    emits: ["copy-config", "refresh-today", "change-window"],
    data() {
      return { windowOptions: WINDOW_OPTIONS };
    },
    methods: {
      copyOcsConfig() {
        this.$emit("copy-config");
      },
      refreshToday() {
        this.$emit("refresh-today");
      },
      changeWindow(key) {
        if (key !== this.timeWindow) this.$emit("change-window", key);
      },
    },
    computed: {
      requestChartSvg() {
        const series = (this.rangeStats && this.rangeStats.requestSeries) || [];
        if (!series.length) return "";
        return SvgChart.line(series, { color: "#3b82f6", height: 180 });
      },
      tokenChartSvg() {
        const series = (this.rangeStats && this.rangeStats.tokenSeries) || [];
        if (!series.length) return "";
        return SvgChart.bar(series, { color: "#10b981", height: 180 });
      },
    },
  };

  global.HomeTab = HomeTab;
})(window);
