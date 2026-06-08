/**
 * useStats composable
 *
 * 封装今日统计 / 时间窗口趋势 / OCS 配置 / 状态 / 日志等只读拉取逻辑。
 *
 * 返回：
 *   { logs, todayStats, rangeStats, ocsConfigStr, timeWindow,
 *     fetchLogs, fetchTodayStats, fetchRangeStats, onChangeWindow, fetchOcsConfig }
 */
(function (global) {
  "use strict";

  /**
   * @param {object} ctx
   * @param {import("vue").Ref[]} ctx.refs  响应式 ref 集合
   */
  function useStats({ logs, todayStats, rangeStats, ocsConfigStr, timeWindow }) {
    async function fetchLogs() {
      const res = await API.getLogs();
      if (res.code === 1) logs.value = res.data || [];
    }

    async function fetchTodayStats() {
      const res = await API.getTodayStats();
      if (res.code === 1) todayStats.value = Stats.formatToday(res.data);
    }

    async function fetchRangeStats(window) {
      const key = window || timeWindow.value || "24h";
      const res = await API.getRangeStats(key);
      if (res.code === 1) rangeStats.value = Stats.formatRange(res.data);
    }

    function onChangeWindow(window) {
      timeWindow.value = window;
      fetchRangeStats(window);
    }

    async function fetchOcsConfig() {
      const res = await API.getOcsConfig();
      if (res.code === 1) ocsConfigStr.value = JSON.stringify(res.data, null, 2);
    }

    return {
      fetchLogs,
      fetchTodayStats,
      fetchRangeStats,
      onChangeWindow,
      fetchOcsConfig,
    };
  }

  global.useStats = useStats;
})(window);
