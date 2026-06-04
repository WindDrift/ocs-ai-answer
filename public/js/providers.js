/**
 * AI 服务商预设模块
 *
 * 内置主流 AI 大模型 API 的官方开发地址与控制台跳转链接。
 * 用户在"AI 设置"页可一键选择预设，避免手动输入 URL。
 *
 * 暴露：
 *   - window.Providers.providers           预设列表
 *   - window.Providers.detectProvider      URL → 服务商识别
 *   - window.Providers.matchByUrl          根据 URL 反查预设项
 */
(function (global) {
  "use strict";

  /**
   * 内置服务商预设
   * - id       内部唯一 ID
   * - name     中文显示名
   * - apiBase  OpenAI 兼容 API Base URL
   * - console  官方控制台 URL
   * - keyword  识别关键字（URL 中包含即匹配）
   * - color    UI 主题色（CSS 变量名）
   */
  const providers = [
    {
      id: "mimo",
      name: "Xiaomi MiMO",
      apiBase: "https://api.xiaomimimo.com/v1",
      console: "https://platform.xiaomimimo.com/",
      keyword: "xiaomimimo",
      color: "#ff6900",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      apiBase: "https://api.deepseek.com/v1",
      console: "https://platform.deepseek.com/",
      keyword: "deepseek",
      color: "#1a73e8",
    },
    {
      id: "qwen",
      name: "通义千问 Qwen",
      apiBase: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      console: "https://bailian.console.aliyun.com/",
      keyword: "dashscope",
      color: "#615ced",
    },
    {
      id: "openai",
      name: "OpenAI",
      apiBase: "https://api.openai.com/v1",
      console: "https://platform.openai.com/",
      keyword: "openai",
      color: "#10a37f",
    },
  ];

  /**
   * 去除 URL 末尾的斜杠，便于比较
   * @param {string} url
   * @returns {string}
   */
  function normalize(url) {
    return (url || "").trim().replace(/\/+$/, "");
  }

  /**
   * 根据当前 URL 反查匹配的预设项（用于初始化时显示选中状态）
   * @param {string} apiBase
   * @returns {object|null}
   */
  function matchByUrl(apiBase) {
    const target = normalize(apiBase).toLowerCase();
    if (!target) return null;
    return providers.find((p) => target === normalize(p.apiBase).toLowerCase()) || null;
  }

  /**
   * 智能识别 URL 属于哪个服务商（与后端 src/routes/status.js 规则一致）
   * @param {string} apiBase
   * @returns {{id: string, name: string, provider: object|null}}
   */
  function detectProvider(apiBase) {
    const raw = (apiBase || "").toLowerCase();
    // 优先用 keyword 匹配（兼容 dashscope 这种 id 不直接出现的情况）
    const hit = providers.find((p) => raw.includes(p.keyword));
    if (hit) {
      return { id: hit.id, name: hit.name, provider: hit };
    }
    return { id: "custom", name: "自定义服务商", provider: null };
  }

  global.Providers = {
    providers,
    detectProvider,
    matchByUrl,
    normalize,
  };
})(window);
