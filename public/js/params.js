/**
 * AI 参数元数据模块
 *
 * 定义当前系统支持的全部 AI 模型参数，参照 OpenAI Chat Completions API 标准。
 * 用于"AI 设置"页动态渲染参数表单，并提供每个参数的提示信息。
 *
 * 每个参数定义：
 *   - key         配置对象中的字段名（驼峰）
 *   - label       中文显示名
 *   - type        控件类型: text | number | select | boolean | json | textarea
 *   - group       所属分组: basic | sampling | limits | penalty | reasoning | advanced
 *   - tip         详细说明（含义、取值范围、使用建议）
 *   - options     select 选项（可选）
 *   - min/max     number 范围（可选）
 *   - step        number 步长（可选）
 *   - placeholder 占位符（可选）
 *
 * 暴露：window.AIParams.groups
 */
(function (global) {
  "use strict";

  /**
   * 全部 AI 参数定义（顺序即 UI 渲染顺序）
   * 注意：与 src/config.js 的 AI_DEFAULTS / src/ai.js 的 buildRequestBody 字段保持一致
   */
  const params = [
    // ============== 基础设置 ==============
    {
      key: "apiBase",
      label: "API Base URL",
      type: "text",
      group: "basic",
      required: true,
      tip: "OpenAI 兼容 API 的入口地址，例如 https://api.openai.com/v1。系统会自动拼接 /chat/completions 后缀。建议从上方预设下拉中选择。",
      placeholder: "如：https://api.openai.com/v1",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      group: "basic",
      required: true,
      tip: "服务商颁发的访问密钥（Bearer Token）。保存后仅写入本地 config.json，不会上传任何远端。",
      placeholder: "sk-...",
    },
    {
      key: "model",
      label: "模型名称 (Model)",
      type: "text",
      group: "basic",
      required: true,
      tip: "目标模型 ID，例如 gpt-4o-mini、deepseek-chat、qwen-plus。不同服务商的可用模型不同，请查阅对应控制台。",
      placeholder: "如：gpt-4o-mini",
    },
    {
      key: "timeout",
      label: "请求超时 (ms)",
      type: "number",
      group: "basic",
      min: 1000,
      step: 1000,
      tip: "单次 API 请求的最大等待时间（毫秒）。推理模型（如 o1/o3）响应较慢，建议设为 120000（2 分钟）以上。",
      placeholder: "默认 60000",
    },
    {
      key: "systemPrompt",
      label: "系统提示词 (System Prompt)",
      type: "textarea",
      group: "basic",
      tip: "控制 AI 角色与答题风格的指令。建议明确：单选只返回字母、判断题返回对/错、填空题直接给答案、不确定时给出最可能答案。",
      placeholder: "你是一个专业的答题助手...",
    },

    // ============== 采样参数 ==============
    {
      key: "temperature",
      label: "Temperature",
      type: "number",
      group: "sampling",
      min: 0,
      max: 2,
      step: 0.1,
      tip: "采样温度，取值 0~2。越低输出越确定（推荐 0~0.3 用于答题），越高越发散有创造性。设为 null 走服务端默认。",
      placeholder: "留空 = 服务端默认（推荐 0.1）",
    },
    {
      key: "topP",
      label: "Top P",
      type: "number",
      group: "sampling",
      min: 0,
      max: 1,
      step: 0.05,
      tip: "核采样阈值 0~1，仅从概率最高、累计概率达 topP 的 token 中采样。与 temperature 二选一控制随机性。",
      placeholder: "留空 = 服务端默认（推荐 1.0）",
    },

    // ============== 生成长度 ==============
    {
      key: "maxTokens",
      label: "Max Tokens",
      type: "number",
      group: "limits",
      min: 1,
      step: 1,
      tip: "单次响应允许生成的最大 token 数。普通模型使用。设为 null 不限制。",
      placeholder: "默认 2048",
    },
    {
      key: "maxCompletionTokens",
      label: "Max Completion Tokens",
      type: "number",
      group: "limits",
      min: 1,
      step: 1,
      tip: "o1/o3 等推理模型专用。设值后会优先于 maxTokens。推理模型建议给较大值（如 25000）以容纳思考链。",
      placeholder: "推理模型专用（如 o1/o3）",
    },

    // ============== 惩罚项 ==============
    {
      key: "frequencyPenalty",
      label: "Frequency Penalty",
      type: "number",
      group: "penalty",
      min: -2,
      max: 2,
      step: 0.1,
      tip: "频率惩罚 -2~2。正值降低已出现 token 的重复概率，减少用词重复；负值则鼓励重复。",
      placeholder: "默认 0",
    },
    {
      key: "presencePenalty",
      label: "Presence Penalty",
      type: "number",
      group: "penalty",
      min: -2,
      max: 2,
      step: 0.1,
      tip: "存在惩罚 -2~2。正值鼓励模型讨论新话题，负值则更聚焦当前话题。",
      placeholder: "默认 0",
    },

    // ============== 推理控制 ==============
    {
      key: "reasoningEffort",
      label: "Reasoning Effort",
      type: "select",
      group: "reasoning",
      tip: "推理强度，仅 o1/o3 系列模型支持。low 速度快但深度低，high 慢但推理更充分。",
      options: [
        { value: null, label: "默认 (null)" },
        { value: "low", label: "Low - 快速" },
        { value: "medium", label: "Medium - 平衡" },
        { value: "high", label: "High - 深度" },
      ],
    },
    {
      key: "thinking",
      label: "Thinking 思考模式",
      type: "select",
      group: "reasoning",
      tip: "扩展思考模式，兼容 MiMO、DeepSeek 等支持思考链的模型。设为 enabled 开启思考，disabled 显式关闭，null 使用服务端默认。",
      options: [
        { value: null, label: "默认 (null)" },
        { value: "enabled", label: "enabled - 开启思考" },
        { value: "disabled", label: "disabled - 关闭思考" },
      ],
    },

    // ============== 高级 ==============
    {
      key: "stop",
      label: "Stop Sequences",
      type: "text",
      group: "advanced",
      tip: "停止序列，遇到后立刻停止生成。多个用半角逗号分隔。",
      placeholder: "如：\\n,END",
    },
    {
      key: "seed",
      label: "Seed",
      type: "number",
      group: "advanced",
      tip: "随机种子，相同输入+种子 → 相同输出，方便复现和回归测试。",
      placeholder: "留空 = 随机",
    },
    {
      key: "stream",
      label: "Stream",
      type: "boolean",
      group: "advanced",
      tip: "是否启用流式输出（当前实现不支持流式，保持 false）。",
    },
    {
      key: "responseFormat",
      label: "Response Format",
      type: "json",
      group: "advanced",
      tip: '输出格式约束，如 {"type": "json_object"} 强制 JSON 输出。留空表示不约束。',
      placeholder: '如：{"type":"json_object"}',
    },
  ];

  /**
   * 参数分组定义（用于 UI 折叠面板）
   */
  const groups = [
    { id: "basic",     label: "基础设置",     icon: "settings" },
    { id: "sampling",  label: "采样参数",     icon: "sliders" },
    { id: "limits",    label: "生成长度",     icon: "maximize" },
    { id: "penalty",   label: "惩罚项",       icon: "shuffle" },
    { id: "reasoning", label: "推理与思考",   icon: "brain" },
    { id: "advanced",  label: "高级控制",     icon: "code" },
  ];

  global.AIParams = { params, groups };
})(window);
