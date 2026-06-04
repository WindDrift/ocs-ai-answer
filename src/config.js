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
  thinking: null,
  stop: null,
  seed: null,
  stream: false,
  responseFormat: null,
  timeout: 60000,
};

/** 会话（多轮上下文）默认值 */
const SESSION_DEFAULTS = {
  enabled: true,
  maxTurns: 5,
  ttlMinutes: 5,
  maxHistoryTokens: 2000,
};

/**
 * 规范化档案列表：确保至少有 default 档案
 * @param {object} config
 * @returns {Array<{name:string, description?:string, ai:object}>}
 */
function normalizeProfiles(config) {
  const raw = config && config.profiles;
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter((p) => p && typeof p.name === "string" && p.name.trim())
      .map((p) => ({
        name: p.name,
        description: p.description || "",
        ai: p.ai || {},
      }));
  }
  return [{ name: "default", description: "默认配置", ai: (config && config.ai) || {} }];
}

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
 * 合并对象与默认值（仅当原值未定义时填充默认值）
 * @param {object} raw   原始配置
 * @param {object} def   默认值
 * @returns {object}
 */
function mergeDefaults(raw, def) {
  const out = {};
  for (const key of Object.keys(def)) {
    out[key] = raw && raw[key] !== undefined ? raw[key] : def[key];
  }
  return out;
}

/**
 * 解析 AI 相关配置，合并环境变量覆盖与默认值
 * @param {object} config - 原始配置对象
 * @returns {object} 解析后的 AI 配置
 */
function resolveAIConfig(config) {
  const ai = (config && config.ai) || {};

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
    thinking: ai.thinking !== undefined ? ai.thinking : AI_DEFAULTS.thinking,
    stop: ai.stop !== undefined ? ai.stop : AI_DEFAULTS.stop,
    seed: ai.seed !== undefined ? ai.seed : AI_DEFAULTS.seed,
    stream: ai.stream !== undefined ? ai.stream : AI_DEFAULTS.stream,
    responseFormat: ai.responseFormat !== undefined ? ai.responseFormat : AI_DEFAULTS.responseFormat,
    timeout: ai.timeout !== undefined ? ai.timeout : AI_DEFAULTS.timeout,
    /** 多轮会话配置（用于服务端拼历史 + 命中 KV 缓存） */
    session: mergeDefaults(ai.session || {}, SESSION_DEFAULTS),
  };
}

class ConfigManager {
  constructor() {
    /** @type {object} 原始配置（来自文件） */
    this._rawConfig = loadConfigFromFile();
    /** @type {Array<object>} 档案列表 */
    this._profiles = normalizeProfiles(this._rawConfig);
    /** @type {string} 当前激活档案名 */
    this._activeProfile = this._resolveActiveProfile();
    /** @type {object} 解析后的 AI 配置 */
    this._aiConfig = resolveAIConfig(this._rawConfig);
  }

  /**
   * 解析当前激活档案名（缺省 default，若指定但不存在则回退到 default）
   * @returns {string}
   */
  _resolveActiveProfile() {
    const declared = this._rawConfig && this._rawConfig.activeProfile;
    if (typeof declared === "string" && declared.trim()) {
      const exists = this._profiles.some((p) => p.name === declared);
      if (exists) return declared;
    }
    return "default";
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

  /** 获取档案列表 */
  get profiles() {
    return this._profiles;
  }

  /** 获取当前激活档案名 */
  get activeProfile() {
    return this._activeProfile;
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
    this._profiles = normalizeProfiles(newConfig);
    this._activeProfile = this._resolveActiveProfile();
    this._aiConfig = resolveAIConfig(newConfig);
  }

  /**
   * 切换到指定档案：将 ai 字段替换为目标档案的 ai 配置，并持久化到文件
   * @param {string} name - 目标档案名
   * @returns {{ok:boolean, msg:string, from?:string, to?:string}}
   */
  switchTo(name) {
    if (!name || typeof name !== "string") {
      return { ok: false, msg: "缺少 name 参数" };
    }
    const target = this._profiles.find((p) => p.name === name);
    if (!target) {
      return { ok: false, msg: "档案不存在: " + name };
    }
    const fromName = this._activeProfile;
    if (fromName === name) {
      return { ok: false, msg: "当前已是该档案: " + name };
    }

    // 原子写入：先备份现有 config.json，失败时回滚
    const backupPath = CONFIG_PATH + ".bak";
    const original = fs.readFileSync(CONFIG_PATH, "utf-8");
    try {
      fs.writeFileSync(backupPath, original, "utf-8");
    } catch (_) {
      // 备份失败不阻塞切换
    }

    const newRaw = JSON.parse(JSON.stringify(this._rawConfig));
    newRaw.ai = JSON.parse(JSON.stringify(target.ai || {}));
    newRaw.activeProfile = name;
    // 同步档案列表：保持用户定义的 profiles 完整
    newRaw.profiles = this._profiles.map((p) => ({
      name: p.name,
      description: p.description,
      ai: p.ai,
    }));

    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(newRaw, null, 2), "utf-8");
    } catch (e) {
      // 写文件失败：回滚到原内容
      try {
        fs.writeFileSync(CONFIG_PATH, original, "utf-8");
      } catch (_) {}
      return { ok: false, msg: "写入配置文件失败: " + e.message };
    }

    // 写文件成功，更新内存
    this._rawConfig = newRaw;
    this._activeProfile = name;
    this._aiConfig = resolveAIConfig(newRaw);

    return { ok: true, msg: "已切换到 " + name, from: fromName, to: name };
  }
}

/** 单例导出 */
module.exports = new ConfigManager();
