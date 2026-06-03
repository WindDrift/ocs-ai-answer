const https = require("https");
const http = require("http");
const configManager = require("../config");
const logger = require("../utils/logger");

function buildRequestBody(question, type, options, aiConfig) {
  let userContent = `题目：${question}`;
  if (type) {
    userContent += `\n题目类型：${type}`;
  }
  if (options) {
    userContent += `\n选项：\n${options}`;
  }

  const body = {
    model: aiConfig.model,
    messages: [
      { role: "system", content: aiConfig.systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: aiConfig.temperature,
  };

  if (aiConfig.topP !== null && aiConfig.topP !== undefined) body.top_p = aiConfig.topP;
  if (aiConfig.maxCompletionTokens !== null && aiConfig.maxCompletionTokens !== undefined) {
    body.max_completion_tokens = aiConfig.maxCompletionTokens;
  } else if (aiConfig.maxTokens !== null && aiConfig.maxTokens !== undefined) {
    body.max_tokens = aiConfig.maxTokens;
  }
  if (aiConfig.frequencyPenalty !== null && aiConfig.frequencyPenalty !== undefined) body.frequency_penalty = aiConfig.frequencyPenalty;
  if (aiConfig.presencePenalty !== null && aiConfig.presencePenalty !== undefined) body.presence_penalty = aiConfig.presencePenalty;
  if (aiConfig.reasoningEffort !== null && aiConfig.reasoningEffort !== undefined) body.reasoning_effort = aiConfig.reasoningEffort;
  if (aiConfig.stop !== null && aiConfig.stop !== undefined) body.stop = aiConfig.stop;
  if (aiConfig.seed !== null && aiConfig.seed !== undefined) body.seed = aiConfig.seed;
  if (aiConfig.stream !== null && aiConfig.stream !== undefined) body.stream = aiConfig.stream;
  if (aiConfig.responseFormat !== null && aiConfig.responseFormat !== undefined) body.response_format = aiConfig.responseFormat;
  if (aiConfig.thinking !== null && aiConfig.thinking !== undefined) body.thinking = aiConfig.thinking;

  return JSON.stringify(body);
}

function callAI(question, type, options) {
  return new Promise((resolve, reject) => {
    const aiConfig = configManager.getAiConfig();
    const startTime = Date.now();
    
    console.log(`题目：${question}`);
    if (options) console.log(`选项：\n${options}`);

    const requestBody = buildRequestBody(question, type, options, aiConfig);

    const url = new URL("/v1/chat/completions", aiConfig.apiBase);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${aiConfig.apiKey}`,
        "Content-Length": Buffer.byteLength(requestBody),
      },
    };

    const req = lib.request(reqOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            const errorMsg = parsed.error.message || JSON.stringify(parsed.error);
            logger.addLog({ time: new Date().toISOString(), question, type, options, error: errorMsg });
            reject(new Error(errorMsg));
            return;
          }
          
          const answer = parsed.choices?.[0]?.message?.content?.trim() || null;
          console.log(`AI 回复：${answer}`);

          const usage = parsed.usage || {};
          const promptTokens = usage.prompt_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;
          const totalTokens = usage.total_tokens || 0;
          const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          
          logger.addLog({
            time: new Date().toISOString(),
            question,
            type,
            options,
            answer,
            promptTokens,
            completionTokens,
            totalTokens,
            timeElapsed
          });

          console.log(`输入 Token：${promptTokens} | 输出 Token：${completionTokens} | 总 Token 数：${totalTokens} | 耗时：${timeElapsed} 秒`);
          console.log(`========================================`);

          resolve(answer);
        } catch (e) {
          const errorMsg = `AI API 响应解析失败: ${data}`;
          logger.addLog({ time: new Date().toISOString(), question, type, options, error: errorMsg });
          reject(new Error(errorMsg));
        }
      });
    });

    req.on("error", (e) => {
      logger.addLog({ time: new Date().toISOString(), question, type, options, error: e.message });
      reject(e);
    });

    req.setTimeout(aiConfig.timeout, () => {
      req.destroy();
      const errorMsg = `AI API 请求超时 (${aiConfig.timeout}ms)`;
      logger.addLog({ time: new Date().toISOString(), question, type, options, error: errorMsg });
      reject(new Error(errorMsg));
    });

    req.write(requestBody);
    req.end();
  });
}

module.exports = {
  callAI
};
