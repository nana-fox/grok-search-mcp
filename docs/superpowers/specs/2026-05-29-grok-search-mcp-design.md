# grok-search-mcp 设计文档

- 日期：2026-05-29
- 状态：待实现
- 位置：`/Users/nio/project/nanafox/grok-search-mcp/`

## 目标

做一个**本地 MCP server**，把 xAI Grok 的实时搜索（Web Search + X Search）能力接入 Claude Code。
对话中暴露一个统一工具 `grok_search`，由 Grok 自行决定搜网页还是搜 X，返回综合答案 + 引用来源。

## 核心约束与决策

| 决策点 | 选择 | 理由 |
|---|---|---|
| 形态 | 本地 MCP server（stdio） | 最贴合「方便接入 Claude Code」，`/mcp` 原生出现工具 |
| 语言/运行时 | TypeScript / Node v22 | 本机 Node 22 现成、原生 fetch、MCP 官方 TS SDK 维护好 |
| 工具范围 | 单个 `grok_search` | 用户选择；Grok 自动决定数据源，调用最简单 |
| 调用通道 | 直连官方 `https://api.x.ai/v1/responses` | 用户确认可直连官方；能用官方原生 server-side search |
| HTTP 方式 | Node 原生 `fetch`，不引第三方 HTTP 库 | 核心诉求是「不依赖第三方、可审计」 |

**不做（YAGNI，明确排除）**：Tavily/Firecrawl 全文抓取、多工具、模型热切换、search_planning、关闭原生工具开关。这些是参考项目 GrokSearch 的复杂来源，与本需求无关。

**未来可选**：`session_id` + 懒加载 sources（先返回答案省 token，需要时再取详细来源）。本期不实现，README 中记录。

## 项目结构

```
grok-search-mcp/
├── package.json          # type:module, bin -> dist/index.js
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server 入口（stdio transport），注册 grok_search 工具
│   ├── grok.ts           # 调 xAI /v1/responses 的纯函数（原生 fetch）
│   └── format.ts         # 把 Grok 答案 + citations 整理成可读文本
├── .env.example          # XAI_API_KEY=、GROK_MODEL=
└── README.md             # 接入命令 + 自审说明 + 未来可选项
```

## 依赖（最小化）

- 运行时：`@modelcontextprotocol/sdk`（官方）、`zod`（参数校验）
- 开发：`typescript`、`@types/node`
- 无任何第三方 HTTP/搜索库。

## 工具接口：`grok_search`

**输入参数（zod 校验）**
- `query: string`（必填）— 搜索/提问内容
- `recency?: "day" | "week" | "month"`（可选）— 时间偏好，转成 X search 的时间窗；默认不限
- `max_sources?: number`（可选）— 期望来源数量上限；默认交给 Grok

**内部行为**
- 固定开启两个 server-side tool：`{"type":"web_search"}` 与 `{"type":"x_search"}`
- Grok agentic 地自行决定调用哪个、调几轮

**输出**
- Grok 综合答案正文
- 末尾「来源」列表：citations 的标题 / URL

## 数据流

```
Claude Code
  → grok_search(query, recency?, max_sources?)
  → grok.ts:
      POST https://api.x.ai/v1/responses
      Headers: Authorization: Bearer $XAI_API_KEY, Content-Type: application/json
      Body: {
        model: $GROK_MODEL,
        input: [{ role: "user", content: <query 注入 recency/max_sources 约束> }],
        tools: [{ type: "web_search" }, { type: "x_search" }]
      }
  → 解析 response：答案文本 + citations
  → format.ts 整理
  → 返回 MCP text content
```

> 实现时核实点（依据 docs.x.ai 官方文档）：`/v1/responses` 响应中答案正文与 citations 的确切字段路径；`x_search` 的时间窗参数名（from_date/to_date 等）；可用模型名（确认更省的 grok fast 版本名后，可把默认模型从 `grok-4.3` 改为 fast 版）。

## 配置

- `XAI_API_KEY`（必填）— 官方 key
- `GROK_MODEL`（可选）— 默认 `grok-4.3`（官方示例默认值），实现时核实后可改为更省的 fast 版

## 错误处理（保持简单，不做重试）

- 缺 `XAI_API_KEY`：启动即明确报错，提示如何设置
- HTTP 非 2xx：透传 xAI 返回的 error message 给调用方
- 网络异常 / 解析失败：返回友好错误文本，不抛崩溃

## 接入 Claude Code

```bash
npm run build   # 产出 dist/
claude mcp add grok-search -e XAI_API_KEY=xai-... \
  -- node /Users/nio/project/nanafox/grok-search-mcp/dist/index.js
```
接入后 `/mcp` 应出现 `grok_search` 工具。

## 测试

- `grok.ts` 纯函数单测（mock fetch）：请求体正确组装、citations 解析正确、错误分支覆盖
- `npm run smoke`：真实打一次官方 API（需 key），验证端到端
- 接入后在 Claude Code `/mcp` 确认工具出现并实际搜一次

## 成功标准

1. `npm run build` 通过，无类型错误
2. 单测通过（请求组装 + 解析 + 错误分支）
3. `claude mcp add` 后 `/mcp` 出现 `grok_search`
4. 实际调用一次能返回 Grok 答案 + 至少一条来源
