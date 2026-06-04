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
}

/** 单例导出 */
module.exports = new LogManager();
module.exports.isSuccessLog = isSuccessLog;
module.exports.isSameLocalDate = isSameLocalDate;
module.exports.getLocalDateStr = getLocalDateStr;
