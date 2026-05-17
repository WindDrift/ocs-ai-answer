# OCS AI 智能答题服务

基于 OpenAI 兼容 API 的本地答题服务，作为 [OCS 网课助手](https://docs.ocsjs.com) 的"AI 题库"，利用大语言模型自动回答网课题目。

## 原理

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   OCS 脚本    │────▶│  本地答题服务器    │────▶│   AI API 服务    │
│  (浏览器端)   │◀────│  (localhost:3000) │◀────│  (api.gpt.ge)   │
└──────────────┘     └──────────────────┘     └─────────────────┘
     ① ②                    ③ ⑦                     ④ ⑥
```

1. **OCS 检测到题目** → 提取题目标题、类型、选项
2. **OCS 发起题库请求** → 根据 AnswererWrapper 配置，向本地服务器发送 HTTP GET/POST 请求
3. **本地服务器接收请求** → 提取题目信息
4. **构造 AI 提示词** → 组装 System Prompt + 题目信息
5. **AI 返回答案** → 大模型根据 prompt 推理出答案
6. **服务器解析响应** → 提取 `choices[0].message.content`
7. **返回 OCS** → 标准化 JSON `{ code: 1, question: "...", answer: "..." }`
8. **OCS handler 解析** → OCS 自动将答案填入网页

本质上，本服务将 **AI 大模型包装成了一个 OCS 兼容的题库 API**。

## 特性

- **零依赖外部 API SDK** — 纯原生 Node.js `https` 模块请求，无需 `openai` 等额外依赖
- **配置文件驱动** — 所有 AI 参数集中在 `config.json` 中，修改无需动代码
- **推理模型支持** — 支持 o1/o3 系列模型的 `reasoning_effort` 思考模式
- **Docker 一键部署** — 提供 Dockerfile + docker-compose.yml，适配 1Panel 等面板
- **Token 消耗可见** — 每次请求在控制台输出推理/总 token 消耗
- **超时保护** — 可配置请求超时，避免无限等待

## 快速开始

### 环境要求

- Node.js ≥ 18
- 一个支持 OpenAI 接口格式的 AI API Key

### 本地运行

```bash
# 1. 克隆 / 下载项目
cd ocs-ai-answer

# 2. 安装依赖
npm install

# 3. 复制并编辑配置
cp config.example.json config.json
# 编辑 config.json，将 apiKey 替换为你的真实密钥

# 4. 启动
npm start
```

看到以下输出即启动成功：

```
========================================
  OCS AI 答题服务已启动
  监听地址: http://0.0.0.0:3000
  AI API: https://api.gpt.ge
  AI 模型: gpt-4.1-mini
========================================
```

验证服务：

```bash
curl http://localhost:3000
# {"service":"OCS AI 答题服务","status":"running",...}
```

## 配置文件参考

所有配置集中在 `config.json` 中，完整配置项如下：

```json
{
  "port": 3000,
  "ai": {
    "apiBase": "https://api.gpt.ge",
    "apiKey": "sk-your-api-key-here",
    "model": "gpt-4.1-mini",
    "systemPrompt": "你是一个专业的答题助手...",
    "temperature": 0.1,
    "topP": 1.0,
    "maxTokens": 2048,
    "maxCompletionTokens": null,
    "frequencyPenalty": 0,
    "presencePenalty": 0,
    "reasoningEffort": null,
    "stop": null,
    "seed": null,
    "stream": false,
    "responseFormat": null,
    "timeout": 60000
  }
}
```

### 配置项详解

| 配置项 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `port` | number | `3000` | 服务监听端口 |
| `ai.apiBase` | string | `"https://api.gpt.ge"` | AI API 基础地址（需兼容 OpenAI 格式） |
| `ai.apiKey` | string | — | **必填**，你的 API 密钥 |
| `ai.model` | string | `"gpt-4.1-mini"` | 使用的模型名称 |
| `ai.systemPrompt` | string | 见示例 | 系统提示词，定义 AI 的答题行为和风格 |
| `ai.temperature` | number | `0.1` | 采样温度 0~2，越低输出越确定，答题推荐 0~0.3 |
| `ai.topP` | number | `1.0` | 核采样概率 0~1，与 temperature 二选一控制随机性 |
| `ai.maxTokens` | number | `2048` | 最大生成 token 数（普通模型用） |
| `ai.maxCompletionTokens` | number\|null | `null` | 最大完成 token 数（推理模型用），设值后优先于 `maxTokens` |
| `ai.frequencyPenalty` | number | `0` | 频率惩罚 -2~2，正值减少用词重复 |
| `ai.presencePenalty` | number | `0` | 存在惩罚 -2~2，正值鼓励讨论新话题 |
| `ai.reasoningEffort` | string\|null | `null` | 推理强度：`"low"` / `"medium"` / `"high"`，仅 o1/o3 模型支持 |
| `ai.stop` | string\|array\|null | `null` | 停止序列，遇到后立刻停止生成 |
| `ai.seed` | number\|null | `null` | 随机种子，相同输入+种子 → 相同输出，方便复现 |
| `ai.stream` | boolean | `false` | 是否使用流式输出（当前不支持，保留字段） |
| `ai.responseFormat` | object\|null | `null` | 输出格式约束，如 `{"type": "json_object"}` |
| `ai.timeout` | number | `60000` | 请求超时时间（毫秒），推理模型建议 ≥ 120000 |

> 设置为 `null` 的配置项不会出现在实际 API 请求体中。

### 环境变量覆盖

以下环境变量可以覆盖配置文件中的对应值：

| 环境变量 | 对应配置 |
|---|---|
| `PORT` | `port` |
| `AI_API_BASE` | `ai.apiBase` |
| `AI_API_KEY` | `ai.apiKey` |
| `AI_MODEL` | `ai.model` |

### 推荐配置组合

**快速答题（GPT-4o-mini 等普通模型）**

```json
{
  "ai": {
    "model": "gpt-4.1-mini",
    "temperature": 0.1,
    "maxTokens": 512,
    "timeout": 30000
  }
}
```

**深度推理（o1-mini / o3-mini）**

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

> **注意**：o1/o3 系列不兼容 `temperature`、`topP` 等参数，务必设为 `null`。

**高确定性复现**

```json
{
  "ai": {
    "model": "gpt-4.1",
    "temperature": 0,
    "seed": 42,
    "maxTokens": 256
  }
}
```

## Docker 部署

### 使用 docker-compose（推荐）

确保已编辑好 `config.json`，然后：

```bash
docker compose up -d
```

#### 更新服务

如果你通过 Git 获取了代码更新，可以使用以下命令来重新构建并重启服务：

```bash
# 1. 拉取最新代码
git pull

# 2. 重新构建并后台启动服务
docker compose up -d --build

# 3. (可选) 查看实时日志确认启动状态
docker compose logs -f
```

### 使用 1Panel 面板

1. 将项目上传到服务器，如 `/opt/ocs-ai-answer/`
2. 编辑 `/opt/ocs-ai-answer/config.json`，填入真实 API Key
3. 登录 1Panel → **容器** → **编排** → **创建编排**
4. 选择项目路径，1Panel 会自动识别 `docker-compose.yml` 并部署

#### 更新服务

1. **更新代码**：通过 1Panel 的 **主机** → **文件** 功能上传覆盖最新的代码，或者通过终端进入项目目录执行 `git pull` 获取最新代码。
2. **重建编排**：登录 1Panel 面板 → 点击左侧菜单 **容器** → 选择 **编排**。
3. 找到你创建的 `ocs-ai-answer` 编排项目，点击操作栏的 **重建**（或者进入该编排的详情页点击“重建”）。
4. 1Panel 会自动执行重新构建镜像并启动最新容器的过程。

### 手动 Docker 命令

```bash
docker build -t ocs-ai-answer .
docker run -d \
  --name ocs-ai-answer \
  -p 3000:3000 \
  -v $(pwd)/config.json:/app/config.json:ro \
  --restart unless-stopped \
  ocs-ai-answer
```

## OCS 网课助手配置

在 OCS 脚本的"题库配置"中填入：

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

> - 使用 `"type": "GM_xmlhttpRequest"` 支持跨域请求
> - 在油猴脚本头部添加 `@connect 你的服务器IP` 或使用 [全域名通用版本](https://greasyfork.org/zh-CN/scripts/481438)

## API 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| `GET` | `/` | 服务状态 |
| `GET` | `/search?title=题目&type=类型&options=选项` | 查询答案 |
| `POST` | `/search` | 查询答案（JSON body） |

### 请求参数

| 参数 | 必填 | 说明 |
|---|---|---|
| `title` | 是 | 题目标题 |
| `type` | 否 | 题目类型：`single` / `multiple` / `judgement` / `completion` |
| `options` | 否 | 题目选项，每行一个 |

### 响应格式

成功：

```json
{ "code": 1, "question": "1+2等于几", "answer": "3" }
```

失败：

```json
{ "code": 0, "msg": "AI API 调用失败: ..." }
```

## 项目结构

```
.
├── server.js              # 主服务入口
├── config.json            # 配置文件（含密钥，不提交 Git）
├── config.example.json    # 配置模板（可提交 Git）
├── Dockerfile             # Docker 镜像构建
├── docker-compose.yml     # Docker Compose 编排
├── .gitignore             # Git 忽略规则
├── package.json           # Node.js 项目配置
└── node_modules/          # 依赖
```

## 常见问题

### 返回 "AI API 调用失败: 401"

API Key 无效或未正确设置，检查 `config.json` 中的 `apiKey`。

### 返回 "AI API 请求超时"

推理模型响应较慢，可增大 `timeout` 值（单位毫秒），如 `120000`（2 分钟）。

### OCS 无法连接到本地服务器

- 确保服务器已启动：`curl http://localhost:3000`
- OCS 配置中使用 `GM_xmlhttpRequest` 类型
- 检查油猴脚本的 `@connect` 元信息

### 推理模型报错 "temperature is not supported"

o1/o3 系列模型不支持 `temperature`、`topP`、`frequencyPenalty`、`presencePenalty`。将这些配置项设为 `null` 即可。

## 许可

ISC