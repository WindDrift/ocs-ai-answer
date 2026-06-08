/**
 * Express 应用组装模块
 *
 * 负责创建和配置 Express 应用实例：
 *   - 注册中间件（trust proxy / JSON 解析 / URL 编码 / 静态文件服务）
 *   - 挂载各功能路由模块
 *   - 全局错误处理
 *   - 导出 app 实例供 server.js 使用
 */

const express = require("express");
const path = require("path");

/* 路由模块 */
const searchRouter = require("./routes/search");
const configRouter = require("./routes/config");
const logsRouter = require("./routes/logs");
const ocsRouter = require("./routes/ocs");
const statusRouter = require("./routes/status");

/* 中间件 */
const { configWriteLimiter, generalApiLimiter } = require("./middleware/rateLimit");

const app = express();

/* ========== 全局配置 ========== */

/** 信任反向代理：让 req.ip 在 Nginx / 1Panel 反代后能取到真实客户端 IP */
app.set("trust proxy", "loopback");

/* ========== 中间件 ========== */

/** JSON 请求体解析（显式上限 1MB） */
app.use(express.json({ limit: "1mb" }));

/** URL 编码请求体解析 */
app.use(express.urlencoded({ extended: true }));

/** 静态文件服务（控制面板前端） */
app.use(express.static(path.join(__dirname, "..", "public")));

/* ========== 路由挂载 ========== */

/** 答题查询接口（内部已挂载 searchLimiter） */
app.use("/search", searchRouter);

/** 服务状态接口 */
app.use("/api/status", statusRouter);

/** 配置管理接口（写操作加更严格的限流） */
app.use("/api/config", generalApiLimiter, configRouter);
app.use("/api/config/profiles/switch", configWriteLimiter);
app.use("/api/config/profiles/upsert", configWriteLimiter);

/** 日志查询接口 */
app.use("/api/logs", generalApiLimiter, logsRouter);

/** OCS 题库配置生成接口 */
app.use("/api/ocs-config", generalApiLimiter, ocsRouter);

/* ========== 全局错误处理 ========== */

/** 404 兜底 */
app.use((req, res, next) => {
  res.status(404).json({ code: 0, msg: "接口不存在: " + req.method + " " + req.originalUrl });
});

/** 错误中间件：捕获未处理异常，避免进程崩溃 */
app.use((err, req, res, next) => {
  console.error("[express] 未处理异常:", err && err.stack ? err.stack : err);
  if (res.headersSent) return;
  res.status(500).json({ code: 0, msg: "内部错误: " + (err && err.message ? err.message : String(err)) });
});

module.exports = app;
