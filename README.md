# grok-search-mcp

本地 MCP server,把 xAI Grok 的实时搜索(Web Search + X Search)接入 Claude Code。
直连官方 `https://api.x.ai/v1/responses`,Node 原生 fetch,无第三方 HTTP/搜索库。

## 工具

- `grok_search(query, recency?, max_sources?)` — Grok 自动决定搜网页还是搜 X,返回综合答案 + 来源。

## 安装

```bash
npm install
npm run build
```

## 接入 Claude Code

```bash
claude mcp add grok-search -e XAI_API_KEY=xai-你的key \
  -- node /Users/nio/project/nanafox/grok-search-mcp/dist/index.js
```

接入后 `/mcp` 应出现 `grok_search`。可选设 `GROK_MODEL` 覆盖默认模型。

## 第三方中转站

默认直连官方 `https://api.x.ai/v1`。若要走第三方中转站(需兼容 xAI Responses API,
即支持 `/responses` 与 `web_search`/`x_search` 工具,如 NanaFocus),设 `XAI_BASE_URL`,
并把 `XAI_API_KEY` 换成中转站的 key:

```bash
XAI_BASE_URL=https://your-relay.example.com/v1 XAI_API_KEY=中转站key npm run smoke
```

接入中转站前,可先用一条 curl 探活,确认它真支持带搜索工具的 Responses API:

```bash
curl https://your-relay.example.com/v1/responses \
  -H "Authorization: Bearer 中转站key" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4.3","input":[{"role":"user","content":"今天有什么AI新闻?"}],"tools":[{"type":"web_search"},{"type":"x_search"}]}'
```

返回的 `output` 里若有 `output_text` 且带 `url_citation` 注解,说明搜索可用。

## 冒烟测试

```bash
XAI_API_KEY=xai-你的key npm run smoke
```

## 设计与可审计性

- 运行时依赖仅:`@modelcontextprotocol/sdk`(官方)、`zod`。
- 所有对 xAI 的请求都在 `src/grok.ts` 一处,用原生 fetch,可逐行审计。

## 未来可选项(本期未实现)

- `session_id` + 懒加载来源:先只返回答案省 token,需要时再按 id 取详细来源。
