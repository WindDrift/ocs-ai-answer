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

const PORT = config.port;

app.listen(PORT, "0.0.0.0", () => {
  const ai = config.ai;
  console.log(`========================================`);
  console.log(`  OCS AI 答题服务已启动`);
  console.log(`  监听地址: http://0.0.0.0:${PORT}`);
  console.log(`  AI API: ${ai.apiBase}`);
  console.log(`  AI 模型: ${ai.model}`);
  console.log(`  控制面板: http://localhost:${PORT}/`);
  console.log(`========================================`);
});
