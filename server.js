const express = require("express");
const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "config.json");
if (!fs.existsSync(configPath)) {
  console.error("错误: config.json 不存在，请复制 config.example.json 为 config.json 并填写配置");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const PORT = process.env.PORT || config.port || 3000;

const ai = config.ai || {};
const AI_API_BASE = process.env.AI_API_BASE || ai.apiBase;
const AI_API_KEY = process.env.AI_API_KEY || ai.apiKey;
const AI_MODEL = process.env.AI_MODEL || ai.model;
const SYSTEM_PROMPT = ai.systemPrompt;

const AI_TEMPERATURE = ai.temperature !== undefined ? ai.temperature : 0.1;
const AI_TOP_P = ai.topP !== undefined ? ai.topP : 1.0;
const AI_MAX_TOKENS = ai.maxTokens !== undefined ? ai.maxTokens : 2048;
const AI_MAX_COMPLETION_TOKENS = ai.maxCompletionTokens !== undefined ? ai.maxCompletionTokens : null;
const AI_FREQUENCY_PENALTY = ai.frequencyPenalty !== undefined ? ai.frequencyPenalty : 0;
const AI_PRESENCE_PENALTY = ai.presencePenalty !== undefined ? ai.presencePenalty : 0;
const AI_REASONING_EFFORT = ai.reasoningEffort !== undefined ? ai.reasoningEffort : null;
const AI_STOP = ai.stop !== undefined ? ai.stop : null;
const AI_SEED = ai.seed !== undefined ? ai.seed : null;
const AI_STREAM = ai.stream !== undefined ? ai.stream : false;
const AI_RESPONSE_FORMAT = ai.responseFormat !== undefined ? ai.responseFormat : null;
const AI_TIMEOUT = ai.timeout !== undefined ? ai.timeout : 60000;

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function buildRequestBody(question, type, options) {
  let userContent = `题目：${question}`;
  if (type) {
    userContent += `\n题目类型：${type}`;
  }
  if (options) {
    userContent += `\n选项：\n${options}`;
  }

  const body = {
    model: AI_MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: AI_TEMPERATURE,
  };

  if (AI_TOP_P !== null && AI_TOP_P !== undefined) {
    body.top_p = AI_TOP_P;
  }

  if (AI_MAX_COMPLETION_TOKENS !== null && AI_MAX_COMPLETION_TOKENS !== undefined) {
    body.max_completion_tokens = AI_MAX_COMPLETION_TOKENS;
  } else if (AI_MAX_TOKENS !== null && AI_MAX_TOKENS !== undefined) {
    body.max_tokens = AI_MAX_TOKENS;
  }

  if (AI_FREQUENCY_PENALTY !== null && AI_FREQUENCY_PENALTY !== undefined) {
    body.frequency_penalty = AI_FREQUENCY_PENALTY;
  }

  if (AI_PRESENCE_PENALTY !== null && AI_PRESENCE_PENALTY !== undefined) {
    body.presence_penalty = AI_PRESENCE_PENALTY;
  }

  if (AI_REASONING_EFFORT !== null && AI_REASONING_EFFORT !== undefined) {
    body.reasoning_effort = AI_REASONING_EFFORT;
  }

  if (AI_STOP !== null && AI_STOP !== undefined) {
    body.stop = AI_STOP;
  }

  if (AI_SEED !== null && AI_SEED !== undefined) {
    body.seed = AI_SEED;
  }

  if (AI_STREAM !== null && AI_STREAM !== undefined) {
    body.stream = AI_STREAM;
  }

  if (AI_RESPONSE_FORMAT !== null && AI_RESPONSE_FORMAT !== undefined) {
    body.response_format = AI_RESPONSE_FORMAT;
  }

  return JSON.stringify(body);
}

function callAI(question, type, options) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(`题目：${question}`);
    if (options) {
      console.log(`选项：\n${options}`);
    }

    const requestBody = buildRequestBody(question, type, options);

    const url = new URL("/v1/chat/completions", AI_API_BASE);
    const isHttps = url.protocol === "https:";
    const lib = isHttps ? https : http;

    const reqOptions = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
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
            reject(new Error(parsed.error.message || JSON.stringify(parsed.error)));
            return;
          }
          const answer =
            parsed.choices &&
            parsed.choices[0] &&
            parsed.choices[0].message &&
            parsed.choices[0].message.content
              ? parsed.choices[0].message.content.trim()
              : null;

          console.log(`AI 回复：\n${answer}`);

          const usage = parsed.usage || {};
          const promptTokens = usage.prompt_tokens || 0;
          const completionTokens = usage.completion_tokens || 0;
          const totalTokens = usage.total_tokens || 0;
          const timeElapsed = ((Date.now() - startTime) / 1000).toFixed(2);
          console.log(`输入 Token：${promptTokens} | 输出 Token：${completionTokens} | 总 Token 数：${totalTokens} | 耗时：${timeElapsed} 秒`);
          console.log(`——————`);

          resolve(answer);
        } catch (e) {
          reject(new Error(`AI API 响应解析失败: ${data}`));
        }
      });
    });

    req.on("error", (e) => reject(e));

    req.setTimeout(AI_TIMEOUT, () => {
      req.destroy();
      reject(new Error(`AI API 请求超时 (${AI_TIMEOUT}ms)`));
    });

    req.write(requestBody);
    req.end();
  });
}

app.get("/search", async (req, res) => {
  const title = req.query.title || "";
  const type = req.query.type || "";
  const options = req.query.options || "";

  if (!title) {
    return res.json({ code: 0, msg: "缺少题目参数 title" });
  }

  try {
    const answer = await callAI(title, type, options);
    if (answer) {
      res.json({ code: 1, question: title, answer });
    } else {
      res.json({ code: 0, msg: "AI 未返回有效答案" });
    }
  } catch (err) {
    console.error("AI API 调用失败:", err.message);
    res.json({ code: 0, msg: `AI API 调用失败: ${err.message}` });
  }
});

app.post("/search", async (req, res) => {
  const title = req.body.title || "";
  const type = req.body.type || "";
  const options = req.body.options || "";

  if (!title) {
    return res.json({ code: 0, msg: "缺少题目参数 title" });
  }

  try {
    const answer = await callAI(title, type, options);
    if (answer) {
      res.json({ code: 1, question: title, answer });
    } else {
      res.json({ code: 0, msg: "AI 未返回有效答案" });
    }
  } catch (err) {
    console.error("AI API 调用失败:", err.message);
    res.json({ code: 0, msg: `AI API 调用失败: ${err.message}` });
  }
});

app.get("/", (req, res) => {
  res.json({
    service: "OCS AI 答题服务",
    status: "running",
    endpoints: {
      "GET /search": "查询答案（参数: title, type, options）",
      "POST /search": "查询答案（JSON body: title, type, options）",
    },
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`========================================`);
  console.log(`  OCS AI 答题服务已启动`);
  console.log(`  监听地址: http://0.0.0.0:${PORT}`);
  console.log(`  AI API: ${AI_API_BASE}`);
  console.log(`  AI 模型: ${AI_MODEL}`);
  console.log(`========================================`);
});
