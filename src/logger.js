const fs = require('fs');
const path = require('path');

/**
 * 日志管理模块
 *
 * 提供内存中的请求日志记录功能，支持：
 *   - 按时间倒序存储日志条目
 *   - 自动裁剪超出上限的旧日志
 *   - 获取全部日志列表
 *   - 持久化到本地文件
 *   - 按日期分组统计（用于"今日数据"板块）
 *   - 按时间窗口聚合统计（用于"近5分钟/30分钟/1小时/3小时/12小时/24小时"趋势）
 */

/** 日志最大保留条数 */
const MAX_LOG_SIZE = 200;
const LOG_FILE_PATH = path.join(__dirname, '..', 'logs.json');

/**
 * 判定一条日志是否为"成功"（有 answer 且无 error）
 * @param {object} log
 * @returns {boolean}
 */
function isSuccessLog(log) {
  return !!(log && log.answer && !log.error);
}

/**
 * 解析日志时间戳为 Date 对象（兼容 ISO 字符串与毫秒数）
 * @param {string|number} time
 * @returns {Date}
 */
function parseLogTime(time) {
  if (time instanceof Date) return time;
  if (typeof time === 'number') return new Date(time);
  const d = new Date(time);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * 判断日志是否属于指定日期（按本地时区的 yyyy-mm-dd 比较）
 * @param {object} log
 * @param {string} dateStr  形如 "2026-06-04"
 * @returns {boolean}
 */
function isSameLocalDate(log, dateStr) {
  const d = parseLogTime(log.time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}` === dateStr;
}

/**
 * 获取本地时区的 yyyy-mm-dd 字符串
 * @param {Date} [date]
 * @returns {string}
 */
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

class LogManager {
  constructor() {
    /** @type {Array<object>} 日志列表（按时间倒序） */
    this._logs = [];
    this._load();
  }

  /** 从文件加载日志 */
  _load() {
    try {
      if (fs.existsSync(LOG_FILE_PATH)) {
        const data = fs.readFileSync(LOG_FILE_PATH, 'utf8');
        this._logs = JSON.parse(data);
      }
    } catch (e) {
      console.error('加载日志文件失败:', e.message);
      this._logs = [];
    }
  }

  /** 保存日志到文件 */
  _save() {
    try {
      fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(this._logs, null, 2), 'utf8');
    } catch (e) {
      console.error('保存日志文件失败:', e.message);
    }
  }

  /**
   * 添加一条日志记录
   * 新日志插入数组头部，超出上限时移除最旧的记录
   * @param {object} log - 日志条目，通常包含 time, question, type, options, answer/error 等字段
   */
  add(log) {
    this._logs.unshift(log);
    if (this._logs.length > MAX_LOG_SIZE) {
      this._logs.pop();
    }
    this._save();
  }

  /** 获取全部日志列表 */
  getAll() {
    return this._logs;
  }

  /**
   * 聚合"今日"统计数据：请求数、Token、命中率、耗时等
   * @param {string} [dateStr] 形如 "2026-06-04"，缺省为本地今天
   * @returns {{
   *   date: string,
   *   requestCount: number,
   *   successCount: number,
   *   failedCount: number,
   *   promptTokens: number,
   *   cachedTokens: number,
   *   completionTokens: number,
   *   totalTokens: number,
   *   cacheHitRate: number,        // 0~1
   *   totalTimeMs: number,         // 所有请求耗时累加（毫秒）
   *   averageInputTokens: number,  // 平均每题输入 token
   *   averageOutputTokens: number, // 平均每题输出 token
   *   averageTimeMs: number,       // 平均每题耗时（毫秒）
   *   perHour: Array<{hour:number, count:number, totalTokens:number}>
   * }}
   */
  getTodayStats(dateStr) {
    const target = dateStr || getLocalDateStr();
    const todayLogs = this._logs.filter((l) => isSameLocalDate(l, target));
    const successLogs = todayLogs.filter(isSuccessLog);

    const sum = (arr, key) => arr.reduce((acc, x) => acc + (Number(x[key]) || 0), 0);

    const promptTokens = sum(successLogs, 'promptTokens');
    const cachedTokens = sum(successLogs, 'promptCacheHitTokens');
    const completionTokens = sum(successLogs, 'completionTokens');
    const totalTokens = sum(successLogs, 'totalTokens');

    const totalTimeMs = successLogs.reduce((acc, x) => {
      const t = parseFloat(x.timeElapsed);
      return acc + (isNaN(t) ? 0 : t * 1000);
    }, 0);

    const requestCount = todayLogs.length;
    const successCount = successLogs.length;
    const cacheHitRate = promptTokens > 0 ? cachedTokens / promptTokens : 0;
    const averageInputTokens = successCount > 0 ? Math.round(promptTokens / successCount) : 0;
    const averageOutputTokens = successCount > 0 ? Math.round(completionTokens / successCount) : 0;
    const averageTimeMs = successCount > 0 ? Math.round(totalTimeMs / successCount) : 0;

    // 按小时分组，用于趋势图
    const perHour = Array.from({ length: 24 }, (_, h) => ({
      hour: h,
      count: 0,
      totalTokens: 0,
    }));
    for (const log of successLogs) {
      const h = parseLogTime(log.time).getHours();
      perHour[h].count += 1;
      perHour[h].totalTokens += Number(log.totalTokens) || 0;
    }

    return {
      date: target,
      requestCount,
      successCount,
      failedCount: requestCount - successCount,
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens,
      cacheHitRate,
      totalTimeMs: Math.round(totalTimeMs),
      averageInputTokens,
      averageOutputTokens,
      averageTimeMs,
      perHour,
    };
  }

  /**
   * 时间窗口配置：key → { 总毫秒, 桶大小毫秒, 桶数, 标签, 桶标签格式化 }
   * 桶标签格式：5min/30min/1h/3h/12h 使用 HH:MM；24h 使用 "HH时"
   */
  static get RANGE_WINDOWS() {
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    return {
      "5m":  { ms: 5 * MIN,    bucketMs: 1 * MIN,  count: 5,  label: "5分钟",  short: "5min" },
      "30m": { ms: 30 * MIN,   bucketMs: 5 * MIN,  count: 6,  label: "30分钟", short: "30min" },
      "1h":  { ms: 1 * HOUR,   bucketMs: 5 * MIN,  count: 12, label: "1小时",  short: "1h" },
      "3h":  { ms: 3 * HOUR,   bucketMs: 15 * MIN, count: 12, label: "3小时",  short: "3h" },
      "12h": { ms: 12 * HOUR,  bucketMs: 30 * MIN, count: 24, label: "12小时", short: "12h" },
      "24h": { ms: 24 * HOUR,  bucketMs: 1 * HOUR, count: 24, label: "24小时", short: "24h" },
    };
  }

  /**
   * 格式化桶的开始时间为 X 轴标签
   * @param {Date} d
   * @param {string} key
   * @returns {string}
   */
  _formatBucketLabel(d, key) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (key === "24h") return `${parseInt(hh, 10)}时`;
    return `${hh}:${mm}`;
  }

  /**
   * 聚合指定时间窗口内的统计数据
   * @param {string} windowKey 形如 "5m" / "30m" / "1h" / "3h" / "12h" / "24h"
   * @returns {object|null} 窗口统计
   */
  getRangeStats(windowKey) {
    const conf = LogManager.RANGE_WINDOWS[windowKey];
    if (!conf) return null;
    const now = Date.now();
    const start = now - conf.ms;

    // 桶索引：0 = 最远桶，count-1 = 包含 now 的最新桶
    const buckets = Array.from({ length: conf.count }, (_, i) => {
      const bucketStart = start + i * conf.bucketMs;
      return {
        bucketStart,
        label: this._formatBucketLabel(new Date(bucketStart), windowKey),
        count: 0,
        totalTokens: 0,
      };
    });

    const inWindow = this._logs.filter((l) => {
      const t = parseLogTime(l.time).getTime();
      return t >= start && t <= now;
    });
    const successInWindow = inWindow.filter(isSuccessLog);

    let promptTokens = 0, cachedTokens = 0, completionTokens = 0, totalTokens = 0, totalTimeMs = 0;
    for (const log of successInWindow) {
      promptTokens += Number(log.promptTokens) || 0;
      cachedTokens += Number(log.promptCacheHitTokens) || 0;
      completionTokens += Number(log.completionTokens) || 0;
      totalTokens += Number(log.totalTokens) || 0;
      const t = parseFloat(log.timeElapsed);
      totalTimeMs += isNaN(t) ? 0 : t * 1000;

      const idx = Math.min(
        conf.count - 1,
        Math.floor((parseLogTime(log.time).getTime() - start) / conf.bucketMs)
      );
      if (idx >= 0 && idx < conf.count) {
        buckets[idx].count += 1;
        buckets[idx].totalTokens += Number(log.totalTokens) || 0;
      }
    }

    const requestCount = inWindow.length;
    const successCount = successInWindow.length;
    const cacheHitRate = promptTokens > 0 ? cachedTokens / promptTokens : 0;
    const averageInputTokens = successCount > 0 ? Math.round(promptTokens / successCount) : 0;
    const averageOutputTokens = successCount > 0 ? Math.round(completionTokens / successCount) : 0;
    const averageTimeMs = successCount > 0 ? Math.round(totalTimeMs / successCount) : 0;

    return {
      window: windowKey,
      windowLabel: conf.label,
      windowMs: conf.ms,
      bucketMs: conf.bucketMs,
      start: start,
      end: now,
      requestCount,
      successCount,
      failedCount: requestCount - successCount,
      promptTokens,
      cachedTokens,
      completionTokens,
      totalTokens,
      cacheHitRate,
      totalTimeMs: Math.round(totalTimeMs),
      averageInputTokens,
      averageOutputTokens,
      averageTimeMs,
      perBucket: buckets,
    };
  }
}

/** 单例导出 */
module.exports = new LogManager();
module.exports.isSuccessLog = isSuccessLog;
module.exports.isSameLocalDate = isSameLocalDate;
module.exports.getLocalDateStr = getLocalDateStr;
