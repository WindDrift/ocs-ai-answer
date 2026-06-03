const app = require("./src/app");
const configManager = require("./src/config");

const PORT = configManager.getPort();
const aiConfig = configManager.getAiConfig();

app.listen(PORT, "0.0.0.0", () => {
  const ai = config.ai;
  console.log(`========================================`);
  console.log(`  OCS AI 答题服务已启动`);
  console.log(`  监听地址: http://0.0.0.0:${PORT}`);
  console.log(`  AI API: ${aiConfig.apiBase}`);
  console.log(`  AI 模型: ${aiConfig.model}`);
  console.log(`  控制面板: http://localhost:${PORT}/`);
  console.log(`========================================`);
});
