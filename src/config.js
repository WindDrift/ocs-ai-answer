/**
 * 配置管理模块
 *
 * 负责从 config.json 加载配置、校验配置完整性、
 * 提供运行时配置访问接口，以及支持热重载配置。
 *
 * 环境变量优先级高于配置文件，支持以下覆盖：
 *   PORT        → port
 *   AI_API_BASE → ai.apiBase
 *   AI_API_KEY  → ai.apiKey
 *   AI_MODEL    → ai.model
 */

const fs = require("fs");
const path = require("path");

/** 配置文件路径 */
const CONFIG_PATH = path.join(__dirname, "..", "config.json");

/** AI 参数默认值映射表 */
const AI_DEFAULTS = {
  temperature: 0.1,
  topP: 1.0,
  maxTokens: 2048,
  maxCompletionTokens: null,
  frequencyPenalty: 0,
  presencePenalty: 0,
  reasoningEffort: null,
  stop: null,
  seed: null,
  stream: false,
  responseFormat: null,
  timeout: 60000,
};

/**
 * 从 config.json 文件加载并解析配置
 * 如果文件不存在则终止进程
 * @returns {object} 解析后的配置对象
 */
function loadConfigFromFile() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error("错误: config.json 不存在，请复制 config.example.json 为 config.json 并填写配置");
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}

/**
 * 解析 AI 相关配置，合并环境变量覆盖与默认值
 * @param {object} config - 原始配置对象
 * @returns {object} 解析后的 AI 配置
 */
function resolveAIConfig(config) {
  const ai = config.ai || {};

  return {
    apiBase: process.env.AI_API_BASE || ai.apiBase,
    apiKey: process.env.AI_API_KEY || ai.apiKey,
    model: process.env.AI_MODEL || ai.model,
    systemPrompt: ai.systemPrompt,
    temperature: ai.temperature !== undefined ? ai.temperature : AI_DEFAULTS.temperature,
    topP: ai.topP !== undefined ? ai.topP : AI_DEFAULTS.topP,
    maxTokens: ai.maxTokens !== undefined ? ai.maxTokens : AI_DEFAULTS.maxTokens,
    maxCompletionTokens: ai.maxCompletionTokens !== undefined ? ai.maxCompletionTokens : AI_DEFAULTS.maxCompletionTokens,
    frequencyPenalty: ai.frequencyPenalty !== undefined ? ai.frequencyPenalty : AI_DEFAULTS.frequencyPenalty,
    presencePenalty: ai.presencePenalty !== undefined ? ai.presencePenalty : AI_DEFAULTS.presencePenalty,
    reasoningEffort: ai.reasoningEffort !== undefined ? ai.reasoningEffort : AI_DEFAULTS.reasoningEffort,
    stop: ai.stop !== undefined ? ai.stop : AI_DEFAULTS.stop,
    seed: ai.seed !== undefined ? ai.seed : AI_DEFAULTS.seed,
    stream: ai.stream !== undefined ? ai.stream : AI_DEFAULTS.stream,
    responseFormat: ai.responseFormat !== undefined ? ai.responseFormat : AI_DEFAULTS.responseFormat,
    timeout: ai.timeout !== undefined ? ai.timeout : AI_DEFAULTS.timeout,
  };
}

class ConfigManager {
  constructor() {
    /** @type {object} 原始配置（来自文件） */
    this._rawConfig = loadConfigFromFile();
    /** @type {object} 解析后的 AI 配置 */
    this._aiConfig = resolveAIConfig(this._rawConfig);
  }

  /** 获取服务端口（环境变量 PORT 优先） */
  get port() {
    return process.env.PORT || this._rawConfig.port || 3000;
  }

  /** 获取原始配置对象（用于前端展示和持久化） */
  get raw() {
    return this._rawConfig;
  }

  /** 获取解析后的 AI 配置 */
  get ai() {
    return this._aiConfig;
  }

  /** 获取配置文件路径 */
  get configPath() {
    return CONFIG_PATH;
  }

  /**
   * 热重载配置：将新配置写入文件并更新内存中的运行时配置
   * @param {object} newConfig - 新的配置对象
   */
  reload(newConfig) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(newConfig, null, 2), "utf-8");
    this._rawConfig = newConfig;
    this._aiConfig = resolveAIConfig(newConfig);
  }
}

/** 单例导出 */
module.exports = new ConfigManager();
