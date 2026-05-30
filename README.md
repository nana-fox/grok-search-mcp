# grok-search-mcp

本地 MCP server,把 xAI Grok 的实时搜索(Web Search + X Search)接入 Claude Code。
默认直连官方 `https://api.x.ai/v1/responses`,Node 原生 fetch + undici(仅用于 HTTPS 代理),无第三方搜索库。

## 工具

- `grok_search(query, recency?, max_sources?)` — Grok 自动决定搜网页还是搜 X,返回综合答案 + 来源。

## 安装

在仓库目录下:

```bash
npm install
npm run build
npm link          # 注册全局命令 grok-search-mcp(走 package.json 的 bin),接入时无需写绝对路径
```

> 用 nvm 的注意:`npm link` 绑定到当前 Node 版本的全局目录。之后 `nvm use` 切到别的版本时,
> 该命令在新版本下不可见,需在仓库里重新 `npm link`。本项目依赖 Node ≥ 22.19。

## 接入 Claude Code

```bash
claude mcp add --scope user grok-search \
  -e XAI_API_KEY=xai-你的key \
  -- grok-search-mcp
```

`--scope user` 让它在本机所有项目里可用(搜索工具通常希望随处可用)。接入后 `/mcp` 应出现
`grok_search`。可选加 `-e GROK_MODEL=grok-4.3` 覆盖默认模型。

走第三方中转站,只需再加一个 `XAI_BASE_URL`,并把 `XAI_API_KEY` 换成中转站的 key:

```bash
claude mcp add --scope user grok-search \
  -e XAI_API_KEY=中转站key \
  -e XAI_BASE_URL=https://your-relay.example.com/v1 \
  -- grok-search-mcp
```

> 尚未发布到 npm。发布后可省去 clone/build/link,直接 `-- npx -y @scope/grok-search-mcp@latest`。

## 第三方中转站

中转站需兼容 xAI Responses API(支持 `/responses` 端点与 `web_search`/`x_search` 工具,如 NanaFocus)。
接入前可先用一条 curl 探活,确认它真支持带搜索工具的 Responses API:

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

- 运行时依赖:`@modelcontextprotocol/sdk`(官方)、`zod`、`undici`(代理支持)。
- 所有对 xAI 的请求都在 `src/grok.ts` 一处,用原生 fetch,可逐行审计。

## 未来可选项(本期未实现)

- `session_id` + 懒加载来源:先只返回答案省 token,需要时再按 id 取详细来源。
