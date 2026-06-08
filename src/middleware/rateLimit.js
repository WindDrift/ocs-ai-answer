/**
 * 速率限制中间件
 *
 * 使用 express-rate-limit 防止 AI 答题接口被滥用导致 token 成本失控。
 * 默认按 IP 限流（依赖 Express 的 trust proxy 设置正确）。
 *
 * 暴露：
 *   - searchLimiter  /search 答题接口限流（默认 60 req/min/IP）
 *   - configWriteLimiter  /api/config 写操作限流（默认 10 req/min/IP）
 *   - generalApiLimiter  其它 /api/* 接口限流（默认 120 req/min/IP）
 *
 * 可通过环境变量覆盖：
 *   RATE_LIMIT_DISABLED=1  关闭所有限流（用于本地调试）
 *   SEARCH_RATE_LIMIT      答题接口窗口内允许请求数
 *   CONFIG_WRITE_RATE_LIMIT  配置写窗口内允许请求数
 */

const rateLimit = require("express-rate-limit");

/** 是否全局禁用限流（本地调试用） */
const disabled = process.env.RATE_LIMIT_DISABLED === "1";

function buildLimiter({ windowMs, max, message, keyPrefix }) {
  if (disabled) {
    // 禁用时返回 noop 中间件
    return (req, res, next) => next();
  }
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => req.ip || "unknown",
    handler: (req, res) => {
      res.status(429).json({
        code: 0,
        msg: message || "请求过于频繁，请稍后再试",
      });
    },
  });
}

const searchLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.SEARCH_RATE_LIMIT) || 60,
  message: "答题请求过于频繁，请稍后再试",
  keyPrefix: "search:",
});

const configWriteLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.CONFIG_WRITE_RATE_LIMIT) || 10,
  message: "配置写操作过于频繁，请稍后再试",
  keyPrefix: "cfg-write:",
});

const generalApiLimiter = buildLimiter({
  windowMs: 60 * 1000,
  max: Number(process.env.API_RATE_LIMIT) || 120,
  message: "API 请求过于频繁，请稍后再试",
  keyPrefix: "api:",
});

module.exports = {
  searchLimiter,
  configWriteLimiter,
  generalApiLimiter,
};
