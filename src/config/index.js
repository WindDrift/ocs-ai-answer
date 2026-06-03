const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../../config.json');

class ConfigManager {
  constructor() {
    this.config = {};
    this.ai = {};
    this.port = 3000;
    this.loadConfig();
  }

  loadConfig() {
    if (!fs.existsSync(configPath)) {
      console.error("错误: config.json 不存在，请复制 config.example.json 为 config.json 并填写配置");
      process.exit(1);
    }
    try {
      this.config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      this.parseConfig();
    } catch (error) {
      console.error("解析 config.json 失败:", error.message);
      process.exit(1);
    }
  }

  parseConfig() {
    this.port = process.env.PORT || this.config.port || 3000;
    this.ai = this.config.ai || {};
    
    // Default values fallback
    this.ai.apiBase = process.env.AI_API_BASE || this.ai.apiBase;
    this.ai.apiKey = process.env.AI_API_KEY || this.ai.apiKey;
    this.ai.model = process.env.AI_MODEL || this.ai.model;
    
    this.ai.temperature = this.ai.temperature !== undefined ? this.ai.temperature : 0.1;
    this.ai.topP = this.ai.topP !== undefined ? this.ai.topP : 1.0;
    this.ai.maxTokens = this.ai.maxTokens !== undefined ? this.ai.maxTokens : 2048;
    this.ai.maxCompletionTokens = this.ai.maxCompletionTokens !== undefined ? this.ai.maxCompletionTokens : null;
    this.ai.frequencyPenalty = this.ai.frequencyPenalty !== undefined ? this.ai.frequencyPenalty : 0;
    this.ai.presencePenalty = this.ai.presencePenalty !== undefined ? this.ai.presencePenalty : 0;
    this.ai.reasoningEffort = this.ai.reasoningEffort !== undefined ? this.ai.reasoningEffort : null;
    this.ai.stop = this.ai.stop !== undefined ? this.ai.stop : null;
    this.ai.seed = this.ai.seed !== undefined ? this.ai.seed : null;
    this.ai.stream = this.ai.stream !== undefined ? this.ai.stream : false;
    this.ai.responseFormat = this.ai.responseFormat !== undefined ? this.ai.responseFormat : null;
    this.ai.timeout = this.ai.timeout !== undefined ? this.ai.timeout : 60000;
    this.ai.thinking = this.ai.thinking !== undefined ? this.ai.thinking : null;
  }

  reloadConfig(newConfig) {
    this.config = newConfig;
    this.parseConfig();
  }

  async saveConfig(newConfig) {
    await fs.promises.writeFile(configPath, JSON.stringify(newConfig, null, 2), "utf-8");
    this.reloadConfig(newConfig);
  }

  getConfig() {
    return this.config;
  }

  getAiConfig() {
    return this.ai;
  }

  getPort() {
    return this.port;
  }
}

const configManager = new ConfigManager();
module.exports = configManager;
