/**
 * 今日数据格式化模块
 *
 * 将后端 /api/logs/today 返回的原始统计数据格式化为 UI 友好的展示数据。
 * 同时提供单条日志的 Token 拆分计算。
 *
 * 暴露：
 *   - window.Stats.formatToday        原始统计 → 展示数据
 *   - window.Stats.formatLogTokens    单条日志 → 4 项 Token 展示
 *   - window.Stats.formatNumber       数字千分位
 *   - window.Stats.formatPercent      0~1 → 百分比字符串
 *   - window.Stats.formatDuration     毫秒 → "X分Y秒"
 */
(function (global) {
  "use strict";

  /**
   * 千分位格式化
   * @param {number} n
   * @returns {string}
   */
  function formatNumber(n) {
    if (n == null || isNaN(n)) return "0";
    return Number(n).toLocaleString("zh-CN");
  }

  /**
   * 0~1 → 百分比字符串，保留 1 位小数
   * @param {number} r
   * @returns {string}
   */
  function formatPercent(r) {
    if (r == null || isNaN(r)) return "0.0%";
    return (r * 100).toFixed(1) + "%";
  }

  /**
   * 毫秒 → "X分Y秒" / "Y秒"
   * @param {number} ms
   * @returns {string}
   */
  function formatDuration(ms) {
    if (!ms || ms < 0) return "0 秒";
    const totalSec = Math.round(ms / 1000);
    if (totalSec < 60) return totalSec + " 秒";
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    if (m < 60) return `${m} 分 ${s} 秒`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    return `${h} 小时 ${rm} 分`;
  }

  /**
   * 格式化今日统计数据为 UI 展示结构
   * @param {object} raw 后端返回的 stats 对象
   * @returns {object}
   */
  function formatToday(raw) {
    if (!raw) return null;
    return {
      date: raw.date,
      requestCount: formatNumber(raw.requestCount),
      successCount: formatNumber(raw.successCount),
      failedCount: formatNumber(raw.failedCount),
      promptTokens: formatNumber(raw.promptTokens),
      cachedTokens: formatNumber(raw.cachedTokens),
      uncachedTokens: formatNumber(
        Math.max(0, (raw.promptTokens || 0) - (raw.cachedTokens || 0))
      ),
      completionTokens: formatNumber(raw.completionTokens),
      totalTokens: formatNumber(raw.totalTokens),
      cacheHitRate: formatPercent(raw.cacheHitRate),
      cacheHitRateValue: raw.cacheHitRate || 0,
      totalTimeMin: (raw.totalTimeMs / 60000).toFixed(2),
      totalTimeText: formatDuration(raw.totalTimeMs),
      averageInputTokens: formatNumber(raw.averageInputTokens),
      averageOutputTokens: formatNumber(raw.averageOutputTokens),
      averageTimeSec: ((raw.averageTimeMs || 0) / 1000).toFixed(2),
      perHour: raw.perHour || [],
    };
  }

  /**
   * 格式化单条日志的 Token 数据（4 项）
   * @param {object} log
   * @returns {{input: number, cached: number, output: number, total: number}}
   */
  function formatLogTokens(log) {
    if (!log) return { input: 0, cached: 0, output: 0, total: 0 };
    return {
      input: Number(log.promptTokens) || 0,
      cached: Number(log.promptCacheHitTokens) || 0,
      output: Number(log.completionTokens) || 0,
      total: Number(log.totalTokens) || 0,
    };
  }

  global.Stats = {
    formatToday,
    formatLogTokens,
    formatNumber,
    formatPercent,
    formatDuration,
  };
})(window);
