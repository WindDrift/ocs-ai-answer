# OCS AI 智能答题服务

基于 OpenAI 兼容 API 的本地答题服务，作为 [OCS 网课助手](https://docs.ocsjs.com) 的"AI 题库"，利用大语言模型自动回答网课题目。

内置 Web 控制面板，支持在线修改配置、查看用量统计、切换配置档案（多模型预设），无需手改配置文件。

---

## 工作原理

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OCS 脚本    │────▶│  本地答题服务器    │────▶│   AI API 服务    │
│  (浏览器端)   │◀────│  (localhost:3000) │◀────│ (任意 OpenAI 兼容)│
└──────────────┘     └──────────────────┘     └─────────────────┘
     ① ②                    ③ ⑦                     ④ ⑥
```

1. **OCS 检测到题目** → 提取题目标题、类型、选项
2. **OCS 发起题库请求** → 按 AnswererWrapper 配置，向本地服务器发送 HTTP 请求
3. **本地服务器接收请求** → 解析参数、加载会话历史
4. **构造 AI 提示词** → `课程背景` + `系统提示词` + `历史问答` + `当前题目`
5. **AI 返回答案** → 大模型根据 prompt 推理出答案
6. **服务器解析响应** → 提取 `choices[0].message.content`
7. **返回 OCS** → 标准化 JSON `{ code: 1, question, answer }`
8. **OCS handler 解析** → 自动将答案填入网页

本质上，本服务将 **AI 大模型包装成了一个 OCS 兼容的题库 API**，并附带多轮上下文与课程上下文能力以提升命中率。

---

## 特性

- **零外部 SDK 依赖** — 仅依赖 Express，请求层使用原生 Node.js `http`/`https` 模块
- **模块化架构** — 配置 / 日志 / 会话 / AI 调用 / 路由 各司其职
- **Web 控制面板** — Vue 3 控制台，支持配置编辑、档案切换、用量统计、日志查询
- **多配置档案** — `config.json` 内可保存多套预设（如 `fast` / `quality`），一键热切换
- **多轮上下文** — 服务端按 `sessionId` 串联历史问答，命中 AI 端 KV 缓存
- **课程上下文注入** — 同一门课/章节共享前缀，AI 响应更精准
- **推理模型支持** — 支持 o1/o3 系列的 `reasoning_effort`、DeepSeek 的 `thinking` 思考模式
- **Token 缓存可观测** — 每次请求输出命中/未命中 token 与命中率
- **用量统计** — 今日数据 + 5min/30min/1h/3h/12h/24h 趋势图
- **热重载配置** — 控制台修改配置无需重启
- **Docker 部署** — 提供 Dockerfile + docker-compose.yml，适配 1Panel 等面板
- **超时保护** — 可配置请求超时，避免无限等待
- **零依赖外部数据库** — 日志与配置均本地存储

---

## 快速开始

### 环境要求

- Node.js ≥ 18
- 一个支持 OpenAI 接口格式的 AI API Key（OpenAI、DeepSeek、通义千问、Xiaomi MiMO 等均可）

### 本地运行

```bash
# 1. 安装依赖
npm install

# 2. 复制并编辑配置
cp config.example.json config.json
# 编辑 config.json，将 apiKey 替换为你的真实密钥

# 3. 启动
npm start
```

启动成功后会看到：

```
========================================
  OCS AI 答题服务已启动
  监听地址: http://0.0.0.0:3000
  AI API: https://api.gpt.ge
  AI 模型: gpt-4.1-mini
  控制面板: http://localhost:3000/
========================================
```

验证服务：

```bash
curl http://localhost:3000/api/status
# {"service":"OCS AI 答题服务","status":"running",...}
```

打开浏览器访问 `http://localhost:3000/` 即可使用 Web 控制面板。

---

## 项目结构

```
.
├── server.js                    # 应用入口，启动 HTTP 服务器
├── config.json                  # 运行时配置（含密钥，不提交 Git）
├── config.example.json          # 配置模板（可提交 Git）
├── Dockerfile                   # Docker 镜像构建
├── docker-compose.yml           # Docker Compose 编排
├── package.json                 # Node.js 项目配置
├── logs.json                    # 持久化日志（运行后生成）
├── public/                      # Web 控制面板前端（纯静态）
│   ├── index.html               #   Vue 3 入口
│   ├── css/                     #   基础 / 布局 / 组件 / 图表 样式
│   └── js/
│       ├── app.js               #   Vue 主应用（导航、主题、Toast）
│       ├── api.js               #   后端 API 调用封装
│       ├── providers.js         #   AI 服务商预设
│       ├── params.js            #   AI 参数元数据
│       ├── stats.js             #   用量统计格式化
│       ├── chart.js             #   SVG 折线图
│       └── components/          #   HomeTab / SettingsTab / LogsTab
└── src/                         # 后端核心业务模块
    ├── app.js                   # Express 应用组装（中间件 + 路由）
    ├── config.js                # 配置管理（加载 / 校验 / 热重载 / 档案）
    ├── logger.js                # 内存日志 + 持久化 + 聚合统计
    ├── session.js               # 多轮会话管理（TTL / 轮数 / token 预算）
    ├── ai.js                    # AI API 交互（请求构建 / 调用 / 响应解析）
    ├── profiles.js              # 配置档案切换历史
    └── routes/
        ├── search.js            # /search                  答题查询
        ├── config.js            # /api/config              配置读写 + 档案管理
        ├── logs.js              # /api/logs                日志 + 统计聚合
        ├── ocs.js               # /api/ocs-config          OCS 配置生成
        └── status.js            # /api/status              服务状态
```

### 模块职责

| 模块 | 文件 | 职责 |
|---|---|---|
| **入口** | `server.js` | 读取配置、监听端口、打印启动 banner |
| **应用组装** | `src/app.js` | 注册 JSON / URL 编码 / 静态资源中间件，挂载各路由 |
| **配置管理** | `src/config.js` | 从 `config.json` 加载；合并环境变量与默认值；支持热重载；管理多档案 |
| **AI 调用** | `src/ai.js` | 构造 OpenAI 兼容请求体（含课程/历史上下文）；发送 HTTP 请求；解析响应；记录 Token 与缓存命中 |
| **会话管理** | `src/session.js` | 多轮会话 Map，TTL/轮数/token 预算三重约束；按 `sessionId` 维护历史；定期 GC |
| **日志管理** | `src/logger.js` | 最多保留 200 条 + 持久化到 `logs.json`；今日聚合 + 时间窗口（5m/30m/1h/3h/12h/24h）趋势 |
| **档案历史** | `src/profiles.js` | 维护最近 20 条档案切换记录 |
| **搜索路由** | `src/routes/search.js` | `GET/POST /search` 答题；`DELETE /search` 清空会话 |
| **配置路由** | `src/routes/config.js` | `GET/POST /api/config`；档案 `GET /`、切换 `POST /switch`、创建/更新 `POST /upsert`、历史 `GET /history` |
| **日志路由** | `src/routes/logs.js` | `GET /api/logs`、`GET /api/logs/today`、`GET /api/logs/range` |
| **OCS 路由** | `src/routes/ocs.js` | `GET /api/ocs-config` 根据当前 host 自动生成 OCS 题库配置 |
| **状态路由** | `src/routes/status.js` | `GET /api/status` 服务健康检查 + 服务商识别 |
| **前端** | `public/` | Vue 3 SPA，三个 Tab：概览与配置 / AI 设置 / 请求日志 |

---

## Web 控制面板

启动后访问 `http://localhost:3000/` 进入控制台，包含三个 Tab：

### 概览与配置（HomeTab）

- **OCS 题库配置** — 一键复制生成的 OCS 配置 JSON
- **服务状态** — 当前服务商徽标、模型、日志条数
- **今日数据** — 6 项核心指标（请求数 / 成功 / 失败 / Token / 缓存命中 / 平均耗时）+ 24h 趋势图

### AI 设置（SettingsTab）

- **配置档案** — 顶部卡片，可在下拉中选择预设档案（如 `fast` / `quality`），点击"一键切换"应用
- **最近切换** — 档案切换时间线（最近 5 条）
- **API Base URL 预设** — 4 家厂商一键选择（OpenAI / DeepSeek / 通义千问 / Xiaomi MiMO），并附官方控制台跳转
- **完整 AI 参数** — 按基础 / 采样 / 限制 / 惩罚 / 推理 / 进阶 分组渲染，支持保存到档案 / 新建档案
- **服务端口** — 修改后需重启

### 请求日志（LogsTab）

- 日志列表（最多 200 条），点行可展开 Token 详细数据（输入 / 缓存命中 / 输出 / 总计 / 耗时）

支持深色/浅色主题切换。

---

## 配置文件参考

完整示例见 [config.example.json](./config.example.json)。所有配置集中在 `config.json` 中：

```json
{
  "port": 3000,
  "activeProfile": "fast",
  "profiles": [
    {
      "name": "fast",
      "description": "快速模式：低延迟，输出短小",
      "ai": { "apiBase": "...", "apiKey": "...", "model": "...", "...": "..." }
    },
    {
      "name": "quality",
      "description": "高质量模式：DeepSeek 思考链",
      "ai": { "...": "..." }
    }
  ]
}
```

> - `profiles` 缺省时，自动回退到根 `ai` 字段并生成一个名为 `default` 的档案
> - `activeProfile` 指向当前激活的档案；切换档案时会同步更新根 `ai` 字段
> - 控制台的所有修改（基础配置、档案、切换）都会写回 `config.json`

### AI 字段详解

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `apiBase` | string | — | **必填**，OpenAI 兼容 API 基础地址（不含 `/chat/completions`） |
| `apiKey` | string | — | **必填**，API 密钥（Bearer Token） |
| `model` | string | — | **必填**，模型 ID，如 `gpt-4o-mini` / `deepseek-reasoner` |
| `systemPrompt` | string | — | 系统提示词，定义 AI 答题风格 |
| `temperature` | number\|null | `0.1` | 采样温度 0~2，越低输出越确定 |
| `topP` | number\|null | `1.0` | 核采样概率 0~1 |
| `maxTokens` | number\|null | `2048` | 最大生成 token 数（普通模型） |
| `maxCompletionTokens` | number\|null | `null` | 最大完成 token 数（推理模型），设值后优先于 `maxTokens` |
| `frequencyPenalty` | number\|null | `0` | 频率惩罚 -2~2 |
| `presencePenalty` | number\|null | `0` | 存在惩罚 -2~2 |
| `reasoningEffort` | string\|null | `null` | 推理强度 `low` / `medium` / `high`，仅 o1/o3 支持 |
| `thinking` | object\|null | `null` | 思考模式配置，如 `{"type":"enabled"}`（DeepSeek 等） |
| `stop` | string\|array\|null | `null` | 停止序列 |
| `seed` | number\|null | `null` | 随机种子（用于复现） |
| `stream` | boolean | `false` | 是否流式输出（当前未实现） |
| `responseFormat` | object\|null | `null` | 输出格式约束，如 `{"type":"json_object"}` |
| `timeout` | number | `60000` | 请求超时（毫秒），推理模型建议 ≥ 120000 |

### 会话（多轮上下文）字段

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `session.enabled` | boolean | `true` | 是否启用服务端多轮上下文 |
| `session.maxTurns` | number | `5` | 单会话保留最大对话轮数（1 轮 = 1 user + 1 assistant） |
| `session.ttlMinutes` | number | `5` | 会话空闲过期时间（分钟），过期后下次请求开新会话 |
| `session.maxHistoryTokens` | number | `2000` | 历史累计最大 token 预算（粗略按 2 字符/token 估算），超出后从最旧淘汰 |

> 字段值为 `null` 时不会出现在实际 API 请求体中。`thinking` 启用模式下会自动剔除 `temperature/topP/frequencyPenalty/presencePenalty`。

### 环境变量覆盖

| 环境变量 | 对应字段 |
|---|---|
| `PORT` | `port` |
| `AI_API_BASE` | `ai.apiBase` |
| `AI_API_KEY` | `ai.apiKey` |
| `AI_MODEL` | `ai.model` |

环境变量优先级高于配置文件，适合 Docker / 容器化部署。

### 推荐配置

**快速答题**

```json
{
  "ai": {
    "model": "gpt-4o-mini",
    "temperature": 0.1,
    "maxTokens": 512,
    "timeout": 30000
  }
}
```

**深度推理（DeepSeek 思考链）**

```json
{
  "ai": {
    "model": "deepseek-reasoner",
    "thinking": { "type": "enabled" },
    "maxCompletionTokens": 4096,
    "temperature": null,
    "topP": null,
    "frequencyPenalty": null,
    "presencePenalty": null,
    "timeout": 90000
  }
}
```

**o1 / o3 系列**

```json
{
  "ai": {
    "model": "o1-mini",
    "reasoningEffort": "medium",
    "maxCompletionTokens": 25000,
    "temperature": null,
    "topP": null,
    "frequencyPenalty": null,
    "presencePenalty": null,
    "timeout": 120000
  }
}
```

---

## Docker 部署

### docker-compose（推荐）

```bash
# 1. 编辑 config.json，填入真实 API Key
cp config.example.json config.json
vi config.json

# 2. 启动
docker compose up -d
```

更新：

```bash
git pull
docker compose up -d --build
docker compose logs -f
```

### 1Panel 面板

1. 将项目上传到服务器，如 `/opt/ocs-ai-answer/`
2. 编辑 `/opt/ocs-ai-answer/config.json`
3. **容器** → **编排** → **创建编排**，选择项目路径即可
4. 更新时上传新代码，回到编排详情页点击 **重建**

### 手动 Docker

```bash
docker build -t ocs-ai-answer .
docker run -d \
  --name ocs-ai-answer \
  -p 3000:3000 \
  -v $(pwd)/config.json:/app/config.json:ro \
  --restart unless-stopped \
  ocs-ai-answer
```

---

## OCS 网课助手配置

### 基础版（单轮）

在 OCS 脚本的"题库配置"中粘贴（也可在控制面板的"概览"页一键复制）：

```json
[
  {
    "url": "http://你的IP:3000/search",
    "name": "AI智能答题",
    "method": "get",
    "contentType": "json",
    "type": "GM_xmlhttpRequest",
    "data": {
      "title": "${title}",
      "type": "${type}",
      "options": "${options}"
    },
    "handler": "return (res) => res.code === 1 ? [res.question, res.answer] : [res.msg, undefined]"
  }
]
```

### 多轮 + 课程上下文版（推荐，命中率最高）

```json
[
  {
    "url": "http://你的IP:3000/search",
    "name": "AI智能答题(多轮)",
    "method": "get",
    "contentType": "json",
    "type": "GM_xmlhttpRequest",
    "data": {
      "title":   "${title}",
      "type":    "${type}",
      "options": "${options}",
      "course":  "《计算机网络》第3章 数据链路层。本章重点：CSMA/CD、PPP协议、MAC地址、以太网帧结构。",
      "session": "course-net-ch3"
    },
    "handler": "return (res) => res.code === 1 ? [res.question, res.answer] : [res.msg, undefined]"
  }
]
```

- `course`：把这门课/章节的关键背景告诉 AI，**该字段在同一 session 下保持完全相同**，作为公共前缀落盘
- `session`：会话 ID，建议按"课程-章节"命名（如 `course-net-ch3`），切章节时改 `session` 即可隔离历史
- 不传 `session` 也能用，服务端会按 `IP + UA` 自动生成兜底 ID

> - 使用 `"type": "GM_xmlhttpRequest"` 支持跨域请求
> - 油猴脚本头部添加 `@connect 你的服务器IP`
> - 切章节时如需手动重置会话，可调用 `DELETE /search?session=course-net-ch3`

### 多轮机制与 KV 缓存

服务侧按 `sessionId` 维度维护历史问答，拼成：

```
[system: 课程背景] [system: 角色 prompt] [user: Q1] [assistant: A1] ... [user: 当前题]
```

同一 session 内，第 2~N 题的 `[system + 历史]` 部分前缀完全相同，会**高概率命中 AI 端上下文磁盘缓存**：

- 第 1 题：命中率 ≈ 0
- 第 2~N 题：命中率显著上升（提示词中除"当前题"外的所有 token 命中）

控制台会输出每次请求的命中情况：

```
[session course-net-ch3] 第 3 轮 | 题目：CSMA/CD 的核心思想是？
输入 Token：420（命中 380 / 未命中 40，命中率 90.5%）| 输出 Token：3 | 耗时：1.23 秒
========================================
```

空闲超过 `ttlMinutes`（默认 5 分钟）后下次请求自动开新会话。

---

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/api/status` | 服务状态 + 服务商识别 |
| `GET` | `/search?title=...&type=...&options=...&course=...&session=...` | 查询答案（query 形式） |
| `POST` | `/search` | 查询答案（JSON body 形式） |
| `DELETE` | `/search?session=xxx` | 清空指定 session 历史 |
| `GET` | `/api/config` | 获取当前完整配置 |
| `POST` | `/api/config` | 更新配置（热重载） |
| `GET` | `/api/config/profiles` | 获取档案列表 + 当前激活 + 切换历史 |
| `POST` | `/api/config/profiles/switch` | 切换到指定档案 |
| `GET` | `/api/config/profiles/history` | 获取档案切换历史 |
| `POST` | `/api/config/profiles/upsert` | 创建或更新档案 |
| `GET` | `/api/logs` | 获取近期请求日志（最多 200 条） |
| `GET` | `/api/logs/today?date=YYYY-MM-DD` | 获取指定日期的聚合统计 |
| `GET` | `/api/logs/range?window=5m\|30m\|1h\|3h\|12h\|24h` | 获取时间窗口趋势统计 |
| `GET` | `/api/ocs-config` | 生成 OCS 题库配置 JSON |

### `/search` 请求参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 题目标题 |
| `type` | 否 | 题目类型：`single` / `multiple` / `judgement` / `completion` |
| `options` | 否 | 题目选项（多行） |
| `course` | 否 | 课程/章节上下文（建议按章节固定） |
| `session` | 否 | 会话 ID，缺省时按 `IP+UA` 自动生成 |

### 响应格式

成功：

```json
{ "code": 1, "question": "1+2等于几", "answer": "3" }
```

失败：

```json
{ "code": 0, "msg": "AI API 调用失败: ..." }
```

---

## 常见问题

### 返回 `AI API 调用失败: 401`

API Key 无效或未正确设置。检查 `config.json` 中的 `apiKey`，或通过控制面板的"AI 设置"页重新填入。

### 返回 `AI API 请求超时`

推理模型响应较慢，将 `timeout` 调大（如 `120000`，即 2 分钟）。DeepSeek 思考链建议 `90000`+。

### OCS 无法连接到本地服务器

- 确认服务已启动：`curl http://localhost:3000/api/status`
- OCS 配置中使用 `GM_xmlhttpRequest` 类型
- 检查油猴脚本的 `@connect` 元信息是否包含服务器 IP
- 浏览器和服务器是否在同一网段；公网部署需放行 3000 端口

### 推理模型报错 `temperature is not supported`

o1 / o3 / DeepSeek 思考模式不支持 `temperature`、`topP`、`frequencyPenalty`、`presencePenalty`。将这些字段设为 `null` 即可。

### DeepSeek 思考模式

确保同时设置：

- `thinking: { "type": "enabled" }`
- `maxCompletionTokens`（而不是 `maxTokens`）
- `temperature` / `topP` / `frequencyPenalty` / `presencePenalty` 均为 `null`

服务会自动剔除 DeepSeek 思考模式不兼容的参数，并通过 `extra_body.thinking` 传递思考配置。

### 切换章节后答案不准

调小 `session.ttlMinutes` 让旧会话更快失效；或在 OCS 中切换 `session` ID；也可手动 `DELETE /search?session=course-xxx`。

### 日志/统计不更新

`logger` 是内存 + 文件持久化（`logs.json`），最大保留 200 条。重启后历史会重新从文件加载，但跨重启的"今日"按本地时区计算。

---

## 许可

ISC
