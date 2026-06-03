/**
 * AI API 调用模块
 *
 * 封装与 OpenAI 兼容 API 的交互逻辑，包括：
 *   - 根据题目信息构建请求体
 *   - 发送 HTTP/HTTPS 请求到 AI API
 *   - 解析响应并提取答案
 *   - 记录 Token 消耗和耗时
 *
 * 使用原生 Node.js http/https 模块，无需额外 SDK 依赖。
 */

const https = require("https");
const http = require("http");
const config = require("./config");
const logger = require("./logger");

/**
 * 构建 OpenAI 兼容的 Chat Completions 请求体
 * 仅当参数值非 null/undefined 时才将其加入请求体，
 * 以避免传递不支持的参数导致 API 报错。
 *
 * @param {string} question - 题目内容
 * @param {string} [type] - 题目类型（single/multiple/judgement/completion）
 * @param {string} [options] - 题目选项
 * @returns {string} JSON 序列化后的请求体
 */
function buildRequestBody(question, type, options) {
  let userContent = `题目：${question}`;
  if (type) {
    userContent += `\n题目类型：${type}`;
  }
  if (options) {
    userContent += `\n选项：\n${options}`;
  }

  const ai = config.ai;
  const body = {
    model: ai.model,
    messages: [
      { role: "system", content: ai.systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: ai.temperature,
  };

  /** 条件性参数：仅当值非 null/undefined 时加入请求体 */
  const optionalParams = {
    top_p: ai.topP,
    max_completion_tokens: ai.maxCompletionTokens,
    max_tokens: ai.maxCompletionTokens ? undefined : ai.maxTokens,
    frequency_penalty: ai.frequencyPenalty,
    presence_penalty: ai.presencePenalty,
    reasoning_effort: ai.reasoningEffort,
    stop: ai.stop,
    seed: ai.seed,
    stream: ai.stream,
    response_format: ai.responseFormat,
  };

  for (const [key, value] of Object.entries(optionalParams)) {
    if (value !== null && value !== undefined) {
      body[key] = value;
    }
  }

  return JSON.stringify(body);
}

/**
 * 调用 AI API 获取题目答案
 *
 * 流程：
 *   1. 构建请求体
 *   2. 根据 apiBase 协议选择 http/https 模块
 *   3. 发送 POST 请求到 /v1/chat/completions
 *   4. 解析响应，提取 choices[0].message.content 作为答案
 *   5. 记录日志（含 Token 消耗和耗时）
 *
 * @param {string} question - 题目内容
 * @param {string} [type] - 题目类型
 * @param {string} [options] - 题目选项
 * @returns {Promise<string|null>} AI 返回的答案文本，失败时 reject
 */
function callAI(question, type, options) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`题目：${question}`);
    if (options) {
      console.log(`选项：\n${options}`);
    }

    const ai = config.ai;
    const requestBody = buildRequestBody(question, type, options);

    const url = new URL("/v1/chat/completions", ai.apiBase);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
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
        try {
          const parsed = JSON.parse(data);

          /* API 返回了错误对象 */
          if (parsed.error) {
            const errorMsg = parsed.error.message || JSON.stringify(parsed.error);
            logger.add({ time: new Date().toISOString(), question, type, options, error: errorMsg });
            reject(new Error(errorMsg));
            return;
          }

          /* 提取 AI 回答内容 */
          const answer =
            parsed.choices &&
            parsed.choices[0] &&
            parsed.choices[0].message &&
            parsed.choices[0].message.content
              ? parsed.choices[0].message.content.trim()
              : null;

          console.log(`AI 回复：${answer}`);

          /* 统计 Token 消耗 */
          const usage = parsed.usage || {};
          const promptTokens = usage.prompt_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;
          const totalTokens = usage.total_tokens || 0;
          const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);

          logger.add({
            time: new Date().toISOString(),
            question,
            type,
            options,
            answer,
            promptTokens,
            completionTokens,
            totalTokens,
            timeElapsed,
          });

          console.log(`输入 Token：${promptTokens} | 输出 Token：${completionTokens} | 总 Token 数：${totalTokens} | 耗时：${timeElapsed} 秒`);
          console.log(`========================================`);

          resolve(answer);
        } catch (e) {
          const errorMsg = `AI API 响应解析失败: ${data}`;
          logger.add({ time: new Date().toISOString(), question, type, options, error: errorMsg });
          reject(new Error(errorMsg));
        }
      });
    });

    /* 网络错误处理 */
    req.on("error", (e) => {
      logger.add({ time: new Date().toISOString(), question, type, options, error: e.message });
      reject(e);
    });

    /* 超时处理 */
    req.setTimeout(ai.timeout, () => {
      req.destroy();
      const errorMsg = `AI API 请求超时 (${ai.timeout}ms)`;
      logger.add({ time: new Date().toISOString(), question, type, options, error: errorMsg });
      reject(new Error(errorMsg));
    });

    req.write(requestBody);
    req.end();
  });
}

module.exports = { callAI, buildRequestBody };
