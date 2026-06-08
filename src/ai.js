/**
 * AI API 调用模块
 *
 * 封装与 OpenAI 兼容 API 的交互逻辑，包括：
 *   - 根据题目信息构建请求体（支持多轮上下文 + 课程上下文）
 *   - 发送 HTTP/HTTPS 请求到 AI API
 *   - 解析响应并提取答案
 *   - 记录 Token 消耗、缓存命中率、耗时
 *
 * 使用原生 Node.js http/https 模块，无需额外 SDK 依赖。
 */

const https = require("https");
const http = require("http");
const config = require("./config");
const logger = require("./logger");
const SessionManager = require("./session");

/**
 * 全局会话管理器（单例）
 * 配置项从 config.json 读取，默认为 5 轮 / 5 分钟空闲过期 / 2000 token 预算
 * 配置变更（reload / switchTo / upsertProfile）会调用 updateLimits 同步
 */
const sessions = new SessionManager(buildSessionOptions(config.ai));

/**
 * 从 ai 配置派生 SessionManager 构造参数
 * @param {object} ai
 */
function buildSessionOptions(ai) {
  const s = (ai && ai.session) || {};
  return {
    maxTurns: s.maxTurns || 5,
    ttlMs: (s.ttlMinutes || 5) * 60 * 1000,
    maxTokens: s.maxHistoryTokens || 2000,
  };
}

/**
 * AI 配置 → session 限制同步
 * 在 ConfigManager 的 reload / switchTo / upsertProfile 后调用
 */
function refreshSessionLimits() {
  sessions.updateLimits(buildSessionOptions(config.ai));
}

/**
 * 长连接 Agent 池：减少高频调用下的 TCP/TLS 握手开销
 */
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 8 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 8 });

/**
 * 集中式"驼峰→snake_case"字段映射表
 * 新增可选 AI 参数时只需在此维护映射，调用方仍以驼峰命名
 */
const FIELD_MAP = {
  apiBase: "api_base",
  apiKey: "api_key",
  topP: "top_p",
  maxTokens: "max_tokens",
  maxCompletionTokens: "max_completion_tokens",
  frequencyPenalty: "frequency_penalty",
  presencePenalty: "presence_penalty",
  reasoningEffort: "reasoning_effort",
  responseFormat: "response_format",
};

/**
 * 将驼峰键转 snake_case（已在映射表内的返回映射值）
 * @param {string} key
 */
function toSnakeKey(key) {
  return FIELD_MAP[key] || key;
}

/**
 * 三段式 user 内容（保持字段顺序稳定，利于 KV 缓存前缀命中）
 * @param {string} question
 * @param {string} [type]
 * @param {string} [options]
 * @returns {string}
 */
function buildUserContent(question, type, options) {
  return [
    `题目：${question || ""}`,
    `题目类型：${type || ""}`,
    `选项：\n${options || ""}`,
  ].join("\n");
}

/**
 * 构建带多轮上下文的请求体
 * @param {object} args
 * @param {string} args.question
 * @param {string} [args.type]
 * @param {string} [args.options]
 * @param {string} [args.course]      课程上下文（一次性发，跨题共享前缀）
 * @param {Array}  [args.history]     多轮历史 [{role, content}]
 * @returns {string} JSON 序列化后的请求体
 */
function buildRequestBody({ question, type, options, course, history }) {
  const ai = config.ai;
  const messages = [];

  // 1) 课程上下文：固定 system message，跨题共享前缀
  if (course && String(course).trim()) {
    messages.push({ role: "system", content: `【课程背景】\n${String(course).trim()}` });
  }
  // 2) 角色 system prompt
  messages.push({ role: "system", content: ai.systemPrompt });
  // 3) 多轮历史（按时间序）
  if (Array.isArray(history)) {
    for (const m of history) messages.push(m);
  }
  // 4) 当前 user 消息
  messages.push({ role: "user", content: buildUserContent(question, type, options) });

  const body = {
    model: ai.model,
    messages,
  };

  // DeepSeek 思考模式下不支持这些参数，需要排除
  const isThinkingMode = ai.thinking && ai.thinking.type === "enabled";

  if (!isThinkingMode) {
    body.temperature = ai.temperature;
  }

  /** 条件性参数：仅当值非 null/undefined 时加入请求体；键名通过 toSnakeKey 转换 */
  const optionalParams = {
    topP: isThinkingMode ? undefined : ai.topP,
    maxCompletionTokens: ai.maxCompletionTokens,
    maxTokens: ai.maxCompletionTokens ? undefined : ai.maxTokens,
    frequencyPenalty: isThinkingMode ? undefined : ai.frequencyPenalty,
    presencePenalty: isThinkingMode ? undefined : ai.presencePenalty,
    reasoningEffort: ai.reasoningEffort,
    stop: ai.stop,
    seed: ai.seed,
    stream: ai.stream,
    responseFormat: ai.responseFormat,
  };

  for (const [k, v] of Object.entries(optionalParams)) {
    if (v !== null && v !== undefined) {
      body[toSnakeKey(k)] = v;
    }
  }

  // DeepSeek 思考模式需要通过 extra_body 传递 thinking 参数
  if (ai.thinking) {
    body.extra_body = {
      thinking: ai.thinking,
    };
  }

  return JSON.stringify(body);
}

/**
 * 解析 AI API 原始响应文本
 * @param {string} raw
 * @returns {{answer: string|null, usage: object}}
 * @throws 当响应非 JSON 或包含 error 字段时
 */
function parseAIResponse(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_) {
    throw new Error(`AI API 响应解析失败: ${raw}`);
  }
  if (parsed && parsed.error) {
    const msg = parsed.error.message || JSON.stringify(parsed.error);
    throw new Error(msg);
  }
  const answer =
    parsed.choices &&
    parsed.choices[0] &&
    parsed.choices[0].message &&
    parsed.choices[0].message.content
      ? parsed.choices[0].message.content.trim()
      : null;
  return { answer, usage: parsed.usage || {} };
}

/**
 * 记录一条成功日志
 */
function recordSuccessLog({ time, sid, turnIndex, course, question, type, options, answer, usage, elapsedMs }) {
  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;
  const totalTokens = usage.total_tokens || 0;
  const promptCacheHitTokens = usage.prompt_cache_hit_tokens || 0;
  const promptCacheMissTokens = usage.prompt_cache_miss_tokens || 0;
  const timeElapsed = (elapsedMs / 1000).toFixed(2);

  logger.add({
    time,
    sessionId: sid,
    turnIndex,
    course: course || null,
    question,
    type,
    options,
    answer,
    promptTokens,
    completionTokens,
    totalTokens,
    promptCacheHitTokens,
    promptCacheMissTokens,
    timeElapsed,
  });

  const hitRate =
    promptTokens > 0
      ? ((promptCacheHitTokens / promptTokens) * 100).toFixed(1) + "%"
      : "0%";
  console.log(
    `输入 Token：${promptTokens}（命中 ${promptCacheHitTokens} / 未命中 ${promptCacheMissTokens}，命中率 ${hitRate}）` +
    ` | 输出 Token：${completionTokens} | 耗时：${timeElapsed} 秒`
  );
  console.log(`========================================`);
}

/**
 * 记录一条错误日志
 */
function recordErrorLog({ time, sid, turnIndex, course, question, type, options, error }) {
  logger.add({
    time,
    sessionId: sid,
    turnIndex,
    course: course || null,
    question,
    type,
    options,
    error,
  });
}

/**
 * 调用 AI API 获取题目答案
 *
 * 流程：
 *   1. 取出/新建会话，加载历史
 *   2. 构建请求体（system + 历史 + 当前 user）
 *   3. 根据 apiBase 协议选择 http/https 模块（带 keep-alive agent）
 *   4. 发送 POST 请求到 /v1/chat/completions
 *   5. 解析响应，提取 choices[0].message.content 作为答案
 *   6. 把这一轮 Q&A 追加进历史
 *   7. 记录日志（含 Token 消耗、缓存命中、耗时）
 *
 * @param {object} args
 * @param {string} args.question
 * @param {string} [args.type]
 * @param {string} [args.options]
 * @param {string} [args.course]
 * @param {string} [args.sessionId]
 * @returns {Promise<string|null>} AI 返回的答案文本，失败时 reject
 */
function callAI({ question, type, options, course, sessionId }) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const sid = sessionId || "default";
    const sessionEnabled =
      !config.ai || !config.ai.session || config.ai.session.enabled !== false;

    // 取出/新建会话，获取历史
    let history = [];
    if (sessionEnabled) {
      sessions.getOrCreate(sid);
      history = sessions.getHistory(sid);
    }

    const turnIndex = history.length / 2 + 1;
    console.log(`[session ${sid}] 第 ${turnIndex} 轮 | 题目：${question}`);
    if (options) console.log(`选项：\n${options}`);

    const requestBody = buildRequestBody({ question, type, options, course, history });

    const ai = config.ai;
    const url = new URL("/v1/chat/completions", ai.apiBase);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;
    const agent = isHttps ? httpsAgent : httpAgent;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      agent,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${ai.apiKey}`,
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const time = new Date().toISOString();
        const elapsedMs = Date.now() - startTime;
        const baseFields = { time, sid, turnIndex, course, question, type, options };
        try {
          const { answer, usage } = parseAIResponse(data);
          console.log(`AI 回复：${answer}`);

          if (sessionEnabled && answer) {
            const userContent = buildUserContent(question, type, options);
            sessions.appendTurn(sid, userContent, answer);
          }

          recordSuccessLog({ ...baseFields, answer, usage, elapsedMs });
          resolve(answer);
        } catch (e) {
          recordErrorLog({ ...baseFields, error: e.message });
          reject(e);
        }
      });
    });

    /* 网络错误处理 */
    req.on("error", (e) => {
      const time = new Date().toISOString();
      recordErrorLog({
        time,
        sid,
        turnIndex,
        course: course || null,
        question,
        type,
        options,
        error: e.message,
      });
      reject(e);
    });

    /* 超时处理：使用 timeout 事件 + destroy 携带错误对象，避免静默 socket 关闭 */
    req.setTimeout(ai.timeout, () => {
      req.destroy(new Error(`AI API 请求超时 (${ai.timeout}ms)`));
    });

    req.write(requestBody);
    req.end();
  });
}

module.exports = {
  callAI,
  buildRequestBody,
  buildUserContent,
  sessions,
  refreshSessionLimits,
  parseAIResponse,
};
