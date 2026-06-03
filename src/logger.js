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
 */

/** 日志最大保留条数 */
const MAX_LOG_SIZE = 200;
const LOG_FILE_PATH = path.join(__dirname, '..', 'logs.json');

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
}

/** 单例导出 */
module.exports = new LogManager();
