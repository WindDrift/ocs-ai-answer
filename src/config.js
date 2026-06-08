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
const fsp = fs.promises;
const path = require("path");

/** 配置文件路径 */
const CONFIG_PATH = path.join(__dirname, "..", "config.json");
/** 配置文件权限：仅当前用户可读写 */
const CONFIG_MODE = 0o600;

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
 * 当 config.ai 缺失时，从 activeProfile 对应档案读取
 * @param {object} config - 原始配置对象
 * @returns {object} 解析后的 AI 配置
 */
function resolveAIConfig(config) {
  let ai = (config && config.ai) || {};

  // 根 ai 缺失：从 activeProfile 档案回退
  if ((!ai || Object.keys(ai).length === 0) && Array.isArray(config && config.profiles) && config.profiles.length > 0) {
    const active = typeof config.activeProfile === "string" ? config.activeProfile : "default";
    const p = config.profiles.find((x) => x && x.name === active) || config.profiles[0];
    if (p && p.ai) ai = p.ai;
  }

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

/**
 * 原子写配置：先备份再写入，失败时回滚
 * @param {object} newRaw 新的完整配置对象
 * @returns {Promise<void>}
 */
async function writeConfigAtomic(newRaw) {
  const backupPath = CONFIG_PATH + ".bak";
  let original = null;
  try {
    original = await fsp.readFile(CONFIG_PATH, "utf-8");
    await fsp.writeFile(backupPath, original, "utf-8");
  } catch (_) {
    // 备份失败不阻塞主流程
  }

  try {
    await fsp.writeFile(CONFIG_PATH, JSON.stringify(newRaw, null, 2), "utf-8");
    try {
      await fsp.chmod(CONFIG_PATH, CONFIG_MODE);
    } catch (_) {
      // 平台不支持或权限不足时忽略
    }
  } catch (e) {
    // 写文件失败：尝试回滚
    if (original !== null) {
      try {
        await fsp.writeFile(CONFIG_PATH, original, "utf-8");
      } catch (_) {}
    }
    throw new Error("写入配置文件失败: " + e.message);
  }
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
    /** @type {Array<Function>} 配置变更订阅者列表（用于联动 SessionManager 等） */
    this._subscribers = [];
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

  /** 注册配置变更订阅者（reload / switchTo / upsertProfile 后会回调） */
  onChange(fn) {
    if (typeof fn === "function") this._subscribers.push(fn);
  }

  /** 通知所有订阅者 */
  _notifyChange() {
    for (const fn of this._subscribers) {
      try {
        fn();
      } catch (e) {
        console.error("配置变更订阅者回调失败:", e && e.message);
      }
    }
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
  async reload(newConfig) {
    await writeConfigAtomic(newConfig);
    this._rawConfig = newConfig;
    this._profiles = normalizeProfiles(newConfig);
    this._activeProfile = this._resolveActiveProfile();
    this._aiConfig = resolveAIConfig(newConfig);
    this._notifyChange();
  }

  /**
   * 切换到指定档案：将 ai 字段替换为目标档案的 ai 配置，并持久化到文件
   * @param {string} name - 目标档案名
   * @returns {Promise<{ok:boolean, msg:string, from?:string, to?:string}>}
   */
  async switchTo(name) {
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

    const newRaw = structuredClone(this._rawConfig);
    newRaw.ai = structuredClone(target.ai || {});
    newRaw.activeProfile = name;
    // 同步档案列表：保持用户定义的 profiles 完整
    newRaw.profiles = this._profiles.map((p) => ({
      name: p.name,
      description: p.description,
      ai: structuredClone(p.ai || {}),
    }));

    await writeConfigAtomic(newRaw);

    // 写文件成功，更新内存
    this._rawConfig = newRaw;
    this._activeProfile = name;
    this._aiConfig = resolveAIConfig(newRaw);
    this._notifyChange();

    return { ok: true, msg: "已切换到 " + name, from: fromName, to: name };
  }

  /**
   * 获取指定档案
   * @param {string} name
   * @returns {object|null}
   */
  getProfile(name) {
    if (!name || typeof name !== "string") return null;
    return this._profiles.find((p) => p.name === name) || null;
  }

  /**
   * 创建或更新档案（不修改当前激活档案与内存 AI 配置）
   * @param {string} name - 档案名
   * @param {object} ai - AI 配置对象
   * @param {string} [description] - 档案描述
   * @returns {Promise<{ok:boolean, msg:string, created?:boolean, profile?:object}>}
   */
  async upsertProfile(name, ai, description) {
    if (!name || typeof name !== "string" || !name.trim()) {
      return { ok: false, msg: "缺少 name 参数" };
    }
    if (!ai || typeof ai !== "object" || Array.isArray(ai)) {
      return { ok: false, msg: "缺少 ai 配置" };
    }
    const trimmed = name.trim();

    const newRaw = structuredClone(this._rawConfig);
    const newProfiles = Array.isArray(newRaw.profiles) ? newRaw.profiles : [];
    const idx = newProfiles.findIndex((p) => p && p.name === trimmed);
    const newProfile = {
      name: trimmed,
      description: typeof description === "string" ? description : (newProfiles[idx] && newProfiles[idx].description) || "",
      ai: structuredClone(ai),
    };
    let created;
    if (idx >= 0) {
      newProfiles[idx] = newProfile;
      created = false;
    } else {
      newProfiles.push(newProfile);
      created = true;
    }
    newRaw.profiles = newProfiles;
    // 若激活档案就是被修改的档案，同步更新根 ai；否则保持根 ai 不变
    if (newRaw.activeProfile === trimmed) {
      newRaw.ai = structuredClone(ai);
    }

    await writeConfigAtomic(newRaw);

    // 写文件成功：重新加载档案列表与 _rawConfig，但保持 _activeProfile / _aiConfig 不变
    this._rawConfig = newRaw;
    this._profiles = normalizeProfiles(newRaw);
    // 若激活档案被修改的也是它，则用最新 ai 重算 _aiConfig；否则保持原 _aiConfig
    if (newRaw.activeProfile === trimmed) {
      this._aiConfig = resolveAIConfig(newRaw);
    }
    this._notifyChange();

    return {
      ok: true,
      msg: created ? "已创建档案 " + trimmed : "已更新档案 " + trimmed,
      created,
      profile: newProfile,
    };
  }
}

/** 单例导出 */
module.exports = new ConfigManager();
