/**
 * 配置档案管理模块
 *
 * 负责：
 *   - 从 config.json 的 profiles 字段加载档案列表
 *   - 切换档案（热重载 AI 配置）
 *   - 维护最近 20 条切换历史
 *
 * 不持有任何 IO 状态：档案列表与当前激活档案由 ConfigManager 持有；
 * 本模块仅负责历史记录的内存存储 + 切换校验。
 */

const fs = require("fs");

/** 历史记录最大条数 */
const MAX_HISTORY_SIZE = 20;

class ProfileManager {
  constructor() {
    /** @type {Array<{time:string, from:string, to:string, success:boolean}>} */
    this._history = [];
  }

  /**
   * 校验档案名是否合法（非空字符串）
   * @param {string} name
   * @returns {boolean}
   */
  isValidName(name) {
    return typeof name === "string" && name.trim().length > 0;
  }

  /**
   * 在档案列表中查找指定名称的档案
   * @param {Array<object>} profiles
   * @param {string} name
   * @returns {object|null}
   */
  findProfile(profiles, name) {
    if (!Array.isArray(profiles)) return null;
    return profiles.find((p) => p && p.name === name) || null;
  }

  /**
   * 添加一条切换历史记录，自动裁剪到上限
   * @param {{from:string, to:string, success:boolean}} entry
   */
  addHistory(entry) {
    const record = {
      time: new Date().toISOString(),
      from: entry.from || "",
      to: entry.to || "",
      success: entry.success !== false,
    };
    this._history.unshift(record);
    if (this._history.length > MAX_HISTORY_SIZE) {
      this._history.length = MAX_HISTORY_SIZE;
    }
  }

  /** 获取历史记录（倒序） */
  getHistory() {
    return this._history.slice();
  }

  /** 清空历史（仅测试用） */
  clearHistory() {
    this._history = [];
  }
}

/** 单例导出 */
module.exports = new ProfileManager();
module.exports.MAX_HISTORY_SIZE = MAX_HISTORY_SIZE;
