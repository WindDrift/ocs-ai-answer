/**
 * 服务状态路由模块
 *
 * 提供服务健康检查和基本信息接口：
 *   GET /api/status - 返回服务运行状态、可用端点列表与服务商识别
 */

const express = require("express");
const config = require("../config");

const router = express.Router();

/**
 * 服务商识别规则（按 url.hostname 包含关键字匹配）
 * 与前端 public/js/providers.js 中的规则保持一致
 */
const PROVIDER_RULES = [
  { id: "deepseek", name: "DeepSeek", match: "deepseek" },
  { id: "mimo",     name: "Xiaomi MiMO", match: "mimo" },
  { id: "qwen",     name: "通义千问 Qwen", match: "dashscope" },
  { id: "openai",   name: "OpenAI", match: "openai" },
  { id: "anthropic",name: "Anthropic Claude", match: "anthropic" },
  { id: "gemini",   name: "Google Gemini", match: "google" },
];

/**
 * 根据 apiBase 智能识别服务商
 * @param {string} apiBase
 * @returns {{id: string, name: string}}
 */
function detectProvider(apiBase) {
  const raw = (apiBase || "").toLowerCase();
  for (const rule of PROVIDER_RULES) {
    if (raw.includes(rule.match)) {
      return { id: rule.id, name: rule.name };
    }
  }
  return { id: "custom", name: "自定义服务商" };
}

/** GET /api/status - 服务状态与健康检查 */
router.get("/", (req, res) => {
  const apiBase = (config.ai && config.ai.apiBase) || "";
  const provider = detectProvider(apiBase);
  res.json({
    service: "OCS AI 答题服务",
    status: "running",
    apiBase,
    provider,
    model: (config.ai && config.ai.model) || null,
    endpoints: {
      "GET /search": "查询答案（参数: title, type, options）",
      "POST /search": "查询答案（JSON body: title, type, options）",
    },
  });
});

module.exports = router;
module.exports.detectProvider = detectProvider;
