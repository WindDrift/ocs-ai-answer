/**
 * 多轮会话管理
 *
 * 用 sessionId 维度把同源请求的历史问答串起来，
 * 喂给 AI 做上下文，命中 KV 缓存前缀。
 *
 * sessionId 来源（按优先级）：
 *   1. 客户端显式传入的 `session` 参数（推荐：OCS 配置里按课程设置）
 *   2. 客户端 IP + UA 哈希（OCS 不传时的兜底）
 *
 * 注意：本模块是纯内存存储，进程重启后会话清空。
 */

const crypto = require("crypto");

class SessionManager {
  /**
   * @param {object} opts
   * @param {number} opts.maxTurns    保留的最大对话轮数（1 轮 = 1 user + 1 assistant）
   * @param {number} opts.ttlMs       会话空闲过期时间（毫秒）
   * @param {number} opts.maxTokens   历史累计最大 token 数（粗略按字符估算）
   */
  constructor({ maxTurns = 5, ttlMs = 5 * 60 * 1000, maxTokens = 2000 } = {}) {
    /** @type {Map<string, { messages: Array, lastActive: number, tokens: number }>} */
    this.sessions = new Map();
    this.maxTurns = maxTurns;
    this.ttlMs = ttlMs;
    this.maxTokens = maxTokens;
  }

  /** 用 IP + UA 派生兜底 sessionId（同源同网识别） */
  static fallbackId(req) {
    const rawIp = req.headers["x-forwarded-for"] || req.ip || (req.connection && req.connection.remoteAddress) || "unknown";
    const ip = rawIp.toString().split(",")[0].trim();
    const ua = req.headers["user-agent"] || "";
    return "ip:" + crypto.createHash("md5").update(ip + "|" + ua).digest("hex").slice(0, 12);
  }

  /** 取出或新建一个会话（过期自动重建） */
  getOrCreate(sessionId) {
    const now = Date.now();
    let s = this.sessions.get(sessionId);
    if (!s || now - s.lastActive > this.ttlMs) {
      s = { messages: [], lastActive: now, tokens: 0 };
      this.sessions.set(sessionId, s);
    } else {
      s.lastActive = now;
    }
    this.gc();
    return s;
  }

  /** 获取历史消息（不含当前轮） */
  getHistory(sessionId) {
    const s = this.sessions.get(sessionId);
    return s ? s.messages : [];
  }

  /** 追加一轮对话，超量时按 token 预算从最旧淘汰 */
  appendTurn(sessionId, userContent, assistantContent) {
    const s = this.sessions.get(sessionId);
    if (!s) return;

    const userTokens = SessionManager.estimateTokens(userContent);
    const asstTokens = SessionManager.estimateTokens(assistantContent);

    s.messages.push({ role: "user", content: userContent });
    s.messages.push({ role: "assistant", content: assistantContent });
    s.tokens += userTokens + asstTokens;

    // 按轮数裁剪
    const maxMsgs = this.maxTurns * 2;
    if (s.messages.length > maxMsgs) {
      const removed = s.messages.splice(0, s.messages.length - maxMsgs);
      s.tokens -= removed.reduce(
        (sum, m) => sum + SessionManager.estimateTokens(m.content),
        0
      );
    }
    // 按 token 预算裁剪
    while (s.tokens > this.maxTokens && s.messages.length >= 2) {
      const u = s.messages.shift();
      const a = s.messages.shift();
      s.tokens -=
        SessionManager.estimateTokens(u.content) +
        SessionManager.estimateTokens(a.content);
    }
  }

  /** 粗略 token 估算：中文 ~1.5 字符/token，英文 ~4 字符/token，取保守 2 字符/token */
  static estimateTokens(text) {
    return Math.ceil(((text || "").length) / 2);
  }

  /** 清理长期不活跃的会话，防止内存泄漏 */
  gc() {
    const now = Date.now();
    for (const [id, s] of this.sessions) {
      if (now - s.lastActive > this.ttlMs * 2) this.sessions.delete(id);
    }
  }

  /** 调试用：当前会话数量 */
  size() {
    return this.sessions.size;
  }

  /** 显式清空某个会话 */
  clear(sessionId) {
    return this.sessions.delete(sessionId);
  }
}

module.exports = SessionManager;
