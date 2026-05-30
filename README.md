# grok-search-mcp

> 把 xAI **Grok 的实时搜索(Web + X/Twitter)** 作为一个 `grok_search` 工具,接入 Claude Code、Codex 等任意 MCP 客户端。

一个轻量的本地 MCP server:它本身不含搜索引擎,只是把你的 AI Agent 的一次工具调用,转成对 xAI
`Responses API` 的请求,由 Grok 在服务端完成实时网页 + X 搜索,返回**综合好的答案与带链接的来源**。
默认直连官方 `https://api.x.ai/v1`,也支持第三方中转站。Node 原生 `fetch` + `undici`(仅用于 HTTPS 代理),无第三方搜索库,核心逻辑集中在 `src/grok.ts`,可逐行审计。

---

## 为什么需要它

Claude Code、Codex 这类 Agent 自带的 WebSearch 已经能搜网页,但有几个真实缺口:

- **缺 X(Twitter)/社交信号**:内置搜索基本只覆盖网页,拿不到 X 上的实时讨论、舆论、突发事件。
- **想指定用 Grok**:Grok 对时效性内容和 X 生态有原生访问,某些场景的结果质量与新鲜度更好。
- **网络受限**:有些环境直连 `api.x.ai` 不通。本工具支持走**第三方中转站**或系统 `HTTPS_PROXY` 出网。

它给你的 Agent 多一个**可自主调用的实时搜索工具**——需要最新信息或 X 上的内容时,Agent 自己就会伸手调它,用法和内置工具一致。

## Grok Search 的优势

- **原生 X(Twitter)搜索**:`web_search` + `x_search` 一起开,网页和社交信号同时覆盖。
- **实时性**:面向"现在正在发生"的信息,可用 `recency` 限定到一天 / 一周 / 一个月内。
- **给答案,不是给一堆链接**:返回 Grok 综合后的答案 + 去重的 `url_citation` 来源列表。
- **自动选源**:Grok 自行决定该搜网页还是搜 X,你不用指定。
- **协议中立**:标准 MCP stdio server,Claude Code / Codex / Cursor / Claude Desktop 等都能接同一份命令。

## 提供的工具

| 工具 | 参数 | 说明 |
|------|------|------|
| `grok_search` | `query`(必填)<br>`recency?`: `day` \| `week` \| `month`<br>`max_sources?`: 正整数 | 实时搜索网页和 X,返回综合答案 + 来源。Grok 自动决定数据源。默认 120s 超时;遇 5xx/429 等上游瞬时错误自动重试 2 次。 |

> **必须使用 Grok 模型。** 本工具依赖 xAI 的服务端搜索工具 `web_search` + `x_search`,其中 `x_search`(搜 X/Twitter)是 Grok/xAI 独有能力。模型只能是 `grok-4.3` 或其它 **Grok** 系列;换成 GPT、Claude 等非 Grok 模型会因为不支持这两个工具而失败。`GROK_MODEL` 仅用于在 Grok 各版本之间切换。

---

## 安装

### 前置条件

- **Node ≥ 22.19**(依赖 `undici` 的要求)、`git`
- 一个 MCP 客户端:**Claude Code** 或 **Codex**
- 一个 **xAI API key**([console.x.ai](https://console.x.ai) 获取),或一个兼容 xAI Responses API 的**中转站 key**

### 第 1 步:获取并构建(注册全局命令 `grok-search-mcp`)

```bash
git clone https://github.com/nana-fox/grok-search-mcp.git
cd grok-search-mcp
npm install
npm run build
npm link        # 注册全局命令 grok-search-mcp,注册到客户端时无需写绝对路径
```

> **用 nvm 的注意**:`npm link` 只对当前 Node 版本生效。之后 `nvm use` 切到别的版本时该命令会"消失",在仓库里重新 `npm link` 即可。

### 第 2 步:注册到你的客户端

把 `xai-你的key` 换成真实 key。两个客户端二选一(或都加):

**Claude Code**

```bash
claude mcp add --scope user grok-search \
  -e XAI_API_KEY=xai-你的key \
  -- grok-search-mcp
```

`--scope user` 让它在本机所有项目可用。可选 `-e GROK_MODEL=grok-4.3` 覆盖默认模型。

**Codex**

```bash
codex mcp add grok-search \
  --env XAI_API_KEY=xai-你的key \
  -- grok-search-mcp
```

写入 `~/.codex/config.toml`,全局生效。可选 `--env GROK_MODEL=grok-4.3`。

**走第三方中转站**:在以上命令里再加一个环境变量,并把 key 换成中转站的:

```bash
# Claude Code:  -e XAI_BASE_URL=https://你的中转站/v1
# Codex:      --env XAI_BASE_URL=https://你的中转站/v1
```

### 第 3 步:验证

```bash
claude mcp list      # Claude Code:应列出 grok-search
codex mcp list       # Codex:应列出 grok-search
```

在 Claude Code 里输入 `/mcp`,应能看到 `grok-search` → `grok_search` 工具。

---

## 使用

注册后无需手动调用,直接在对话里提需要实时信息的问题,Agent 会自动选用 `grok_search`,例如:

- "查一下今天 X 上关于 xAI 的讨论"
- "这周 AI 领域有什么大新闻?给我来源"

也可以显式要求:"用 grok_search 搜 ……"。返回内容是 Grok 的综合答案,末尾附带编号的来源链接。

### 配置项(环境变量)

| 变量 | 必填 | 默认 | 说明 |
|------|------|------|------|
| `XAI_API_KEY` | 是 | — | xAI 或中转站的 API key |
| `XAI_BASE_URL` | 否 | `https://api.x.ai/v1` | 第三方中转站 base URL(到 `/v1` 为止) |
| `GROK_MODEL` | 否 | `grok-4.3` | 覆盖默认模型,**只能是 Grok 系列**(见上方提示) |
| `GROK_TIMEOUT_MS` | 否 | `120000` | 单次请求超时(毫秒)。慢网络/中转站可调大,如 `300000` |
| `HTTPS_PROXY` / `HTTP_PROXY` | 否 | — | 标准代理变量,自动生效(经 undici) |

---

## 第三方中转站

中转站需兼容 xAI Responses API(支持 `/responses` 端点与 `web_search` / `x_search` 工具,如 NanaFocus),且**模型必须仍是 Grok 系列**——即使中转站也提供 GPT/Claude,这套搜索设计也只在 Grok 上成立。
接入前可先用一条 curl 探活,确认它真支持带搜索工具的 Responses API:

```bash
curl https://你的中转站/v1/responses \
  -H "Authorization: Bearer 中转站key" \
  -H "Content-Type: application/json" \
  -d '{"model":"grok-4.3","input":[{"role":"user","content":"今天有什么AI新闻?"}],"tools":[{"type":"web_search"},{"type":"x_search"}]}'
```

返回的 `output` 里若有 `output_text` 且带 `url_citation` 注解,说明搜索可用。

## 冒烟测试(本地直连一次真实 API)

```bash
XAI_API_KEY=xai-你的key npm run smoke
# 走中转站:
XAI_BASE_URL=https://你的中转站/v1 XAI_API_KEY=中转站key npm run smoke
```

---

## 故障排查

| 现象 | 原因 / 解决 |
|------|------------|
| 客户端报找不到 `grok-search-mcp` | 没 `npm link`,或 nvm 切了 Node 版本——回仓库重新 `npm link` |
| 启动报 `缺少 XAI_API_KEY` | 注册命令里漏了 `-e/--env XAI_API_KEY=...` |
| `npm install` 或运行报 Node 版本错误 | 升级到 Node ≥ 22.19 |
| 直连 `api.x.ai` 超时 | 调大 `GROK_TIMEOUT_MS`;或设 `XAI_BASE_URL` 走中转站、设 `HTTPS_PROXY` |
| 报 `xAI API 错误 502/503`(持续) | 上游/中转站瞬时错误已自动重试;若持续,是 xAI 或你的中转站在挂,需等其恢复或换端点 |
| 想卸载 | `claude mcp remove grok-search` / `codex mcp remove grok-search` |

## 设计与可审计性

- 运行时依赖:`@modelcontextprotocol/sdk`(官方)、`zod`、`undici`(代理支持)。
- 所有对 xAI 的请求都在 `src/grok.ts` 一处,用原生 `fetch`,带 120s 超时与 5xx/429 自动重试(指数退避,尊重 `Retry-After`),可逐行审计。
- MCP 适配层(`src/index.ts`)极薄:只注册一个工具,把调用转给 `src/grok.ts`。

## 未来可选项(本期未实现)

- 发布到 npm:发布后可省去 clone/build/link,直接 `-- npx -y @nana-fox/grok-search-mcp@latest`。
- `session_id` + 懒加载来源:先只返回答案省 token,需要时再按 id 取详细来源。

## License

[MIT](./LICENSE) © NanaFox
