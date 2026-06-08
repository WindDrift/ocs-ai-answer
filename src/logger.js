/**
 * 日志管理模块
 *
 * 提供：
 *   - 业务请求日志（add / getAll / getTodayStats / getRangeStats），最大 200 条 + 异步批量落盘
 *   - 统一日志门面（info / warn / error / debug），支持 LOG_LEVEL 环境变量
 *   - 落盘采用环形 buffer + 1s / 20 条触发节流，避免高频写入
 *   - 加载失败时将损坏文件改名 .broken-<ts>，避免下次启动继续抛错
 */

const fs = require("fs");
const fsp = fs.promises;
const path = require("path");

/** 日志最大保留条数 */
const MAX_LOG_SIZE = 200;
const LOG_FILE_PATH = path.join(__dirname, "..", "logs.json");

/** 批量落盘配置 */
const FLUSH_INTERVAL_MS = 1000; // 1 秒
const FLUSH_BATCH_SIZE = 20; // 累计 20 条触发

/**
 * 判定一条业务日志是否为"成功"（有 answer 且无 error）
 */
function isSuccessLog(log) {
  return !!(log && log.answer && !log.error);
}

/**
 * 解析日志时间戳为 Date 对象（兼容 ISO 字符串与毫秒数）
 */
function parseLogTime(time) {
  if (time instanceof Date) return time;
  if (typeof time === "number") return new Date(time);
  const d = new Date(time);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * 判断日志是否属于指定日期（按本地时区的 yyyy-mm-dd 比较）
 */
function isSameLocalDate(log, dateStr) {
  const d = parseLogTime(log.time);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}` === dateStr;
}

/**
 * 获取本地时区的 yyyy-mm-dd 字符串
 */
function getLocalDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

class LogManager {
  constructor() {
    /** @type {Array<object>} 日志列表（按时间倒序） */
    this._logs = [];
    /** @type {boolean} 是否有未落盘的变更 */
    this._dirty = false;
    /** @type {NodeJS.Timeout|null} 定时落盘句柄 */
    this._flushTimer = null;
    this._load();
    this._startFlushTimer();
  }

  /** 从文件加载日志；解析失败时改名 .broken-<ts>，不阻塞启动 */
  async _load() {
    try {
      if (fs.existsSync(LOG_FILE_PATH)) {
        const data = await fsp.readFile(LOG_FILE_PATH, "utf8");
        this._logs = JSON.parse(data);
      }
    } catch (e) {
      console.error("[logger] 加载日志文件失败:", e.message);
      this._logs = [];
      try {
        const brokenPath = `${LOG_FILE_PATH}.broken-${Date.now()}`;
        await fsp.rename(LOG_FILE_PATH, brokenPath);
        console.error(`[logger] 已将损坏文件改名为 ${brokenPath}`);
      } catch (_) {
        // 改名也失败时，保留原文件
      }
    }
  }

  /** 立即落盘（供 SIGTERM 处理时调用） */
  async flush() {
    if (!this._dirty) return;
    try {
      await fsp.writeFile(LOG_FILE_PATH, JSON.stringify(this._logs, null, 2), "utf8");
      this._dirty = false;
    } catch (e) {
      console.error("[logger] 落盘失败:", e.message);
    }
  }

  /** 启动定时器：每 FLUSH_INTERVAL_MS 检查一次是否需要落盘 */
  _startFlushTimer() {
    if (this._flushTimer) return;
    this._flushTimer = setInterval(() => {
      if (this._dirty) this.flush();
    }, FLUSH_INTERVAL_MS);
    // 进程退出时 unref，避免阻塞退出
    if (this._flushTimer && typeof this._flushTimer.unref === "function") {
      this._flushTimer.unref();
    }
  }

  /**
   * 添加一条业务日志
   * 标记脏位并在达到批量阈值时立即 flush
   */
  add(log) {
    this._logs.unshift(log);
    if (this._logs.length > MAX_LOG_SIZE) {
      this._logs.length = MAX_LOG_SIZE;
    }
    this._dirty = true;
    if (this._logs.length % FLUSH_BATCH_SIZE === 0) {
      // 不阻塞调用方
      this.flush();
    }
  }

  /** 获取全部日志列表 */
  getAll() {
    return this._logs;
  }

  /**
   * 聚合"今日"统计数据
   */
  getTodayStats(dateStr) {
    const target = dateStr || getLocalDateStr();
    const todayLogs = this._logs.filter((l) => isSameLocalDate(l, target));
    const successLogs = todayLogs.filter(isSuccessLog);

    const sum = (arr, key) => arr.reduce((acc, x) => acc + (Number(x[key]) || 0), 0);

    const promptTokens = sum(successLogs, "promptTokens");
    const cachedTokens = sum(successLogs, "promptCacheHitTokens");
    const completionTokens = sum(successLogs, "completionTokens");
    const totalTokens = sum(successLogs, "totalTokens");

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
   * 时间窗口配置
   */
  static get RANGE_WINDOWS() {
    const MIN = 60 * 1000;
    const HOUR = 60 * MIN;
    return {
      "5m": { ms: 5 * MIN, bucketMs: 1 * MIN, count: 5, label: "5分钟", short: "5min" },
      "30m": { ms: 30 * MIN, bucketMs: 5 * MIN, count: 6, label: "30分钟", short: "30min" },
      "1h": { ms: 1 * HOUR, bucketMs: 5 * MIN, count: 12, label: "1小时", short: "1h" },
      "3h": { ms: 3 * HOUR, bucketMs: 15 * MIN, count: 12, label: "3小时", short: "3h" },
      "12h": { ms: 12 * HOUR, bucketMs: 30 * MIN, count: 24, label: "12小时", short: "12h" },
      "24h": { ms: 24 * HOUR, bucketMs: 1 * HOUR, count: 24, label: "24小时", short: "24h" },
    };
  }

  /**
   * 格式化桶的开始时间为 X 轴标签
   */
  _formatBucketLabel(d, key) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    if (key === "24h") return `${parseInt(hh, 10)}时`;
    return `${hh}:${mm}`;
  }

  /**
   * 聚合指定时间窗口内的统计数据
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

    let promptTokens = 0,
      cachedTokens = 0,
      completionTokens = 0,
      totalTokens = 0,
      totalTimeMs = 0;
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
const logManager = new LogManager();

/* ========== 统一日志门面（A8） ========== */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const currentLevel = LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] || LEVELS.info;

function format(level, args) {
  const ts = new Date().toISOString();
  return [`[${ts}] [${level.toUpperCase()}]`, ...args];
}

const facade = {
  debug: (...args) => {
    if (currentLevel <= LEVELS.debug) console.log(...format("debug", args));
  },
  info: (...args) => {
    if (currentLevel <= LEVELS.info) console.log(...format("info", args));
  },
  warn: (...args) => {
    if (currentLevel <= LEVELS.warn) console.warn(...format("warn", args));
  },
  error: (...args) => {
    if (currentLevel <= LEVELS.error) console.error(...format("error", args));
  },
};

module.exports = logManager;
module.exports.logger = facade;
module.exports.isSuccessLog = isSuccessLog;
module.exports.isSameLocalDate = isSameLocalDate;
module.exports.getLocalDateStr = getLocalDateStr;
