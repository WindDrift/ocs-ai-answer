/**
 * OCS AI 答题服务 - 入口文件
 *
 * 启动 Express 服务器，监听指定端口。
 * 所有业务逻辑已拆分至 src/ 目录下的模块中：
 *   - src/config.js   配置管理
 *   - src/logger.js   日志管理
 *   - src/ai.js       AI API 调用
 *   - src/app.js      Express 应用组装
 *   - src/routes/     各功能路由
 */

const app = require("./src/app");
const config = require("./src/config");
const { refreshSessionLimits } = require("./src/ai");
const logger = require("./src/logger");

/**
 * 注册配置变更订阅：AI 模块的 SessionManager 限制（maxTurns / ttlMs / maxTokens）
 * 需要随 config.json 中 session 字段变更而同步更新
 */
config.onChange(() => {
  try {
    refreshSessionLimits();
    logger.info("[server] SessionManager limits refreshed from config");
  } catch (e) {
    logger.error("[server] refreshSessionLimits failed:", e && e.message);
  }
});

const PORT = config.port;

const server = app.listen(PORT, "0.0.0.0", () => {
  const ai = config.ai;
  console.log(`========================================`);
  console.log(`  OCS AI 答题服务已启动`);
  console.log(`  监听地址: http://0.0.0.0:${PORT}`);
  console.log(`  AI API: ${ai.apiBase}`);
  console.log(`  AI 模型: ${ai.model}`);
  console.log(`  控制面板: http://localhost:${PORT}/`);
  console.log(`========================================`);
});

/**
 * 优雅关闭：收到 SIGTERM / SIGINT 时先停服务 → flush 日志 → 退出
 */
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[server] received ${signal}, shutting down gracefully...`);
  // 停止接收新连接
  server.close((err) => {
    if (err) {
      console.error("[server] server.close error:", err.message);
    }
  });
  // 给已有请求 5s 收尾时间
  const forceExitTimer = setTimeout(() => {
    console.warn("[server] forced exit after 5s");
    process.exit(1);
  }, 5000);
  if (typeof forceExitTimer.unref === "function") forceExitTimer.unref();

  try {
    await logger.flush();
  } catch (e) {
    console.error("[server] logger.flush failed:", e && e.message);
  }
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

/** 未捕获异常：记录后继续运行，避免进程崩溃 */
process.on("uncaughtException", (err) => {
  console.error("[server] uncaughtException:", err && err.stack ? err.stack : err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[server] unhandledRejection:", reason);
});
