# grok-search-mcp 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 做一个本地 MCP server,暴露单个 `grok_search` 工具,直连 xAI 官方 `/v1/responses` 用原生 web_search + x_search 搜索,返回答案与来源,接入 Claude Code。

**Architecture:** TypeScript/Node(ESM),Node 原生 fetch 直打官方端点。核心拆三个文件:`grok.ts`(请求组装 + 响应解析 + HTTP 调用,纯函数为主便于测试)、`format.ts`(答案+来源转可读文本)、`index.ts`(MCP server 接线)。无第三方 HTTP/搜索库。

**Tech Stack:** TypeScript, `@modelcontextprotocol/sdk`, `zod`;dev:`vitest`, `typescript`, `@types/node`。

所有命令默认在 `/Users/nio/project/nanafox/grok-search-mcp/` 下执行(当前会话每条命令前加 `cd /Users/nio/project/nanafox/grok-search-mcp &&`)。

---

## 文件结构

| 文件 | 职责 |
|---|---|
| `package.json` | ESM、scripts、依赖、bin |
| `tsconfig.json` | NodeNext、输出 dist |
| `src/grok.ts` | 类型定义 + `buildInput` + `buildRequestBody` + `parseGrokResponse` + `callGrokSearch` |
| `src/format.ts` | `formatResult` |
| `src/index.ts` | MCP server,注册 `grok_search`,stdio 连接 |
| `tests/grok.test.ts` | grok.ts 单测 |
| `tests/format.test.ts` | format.ts 单测 |
| `scripts/smoke.mjs` | 真实打一次官方 API 的端到端冒烟(需 key) |
| `.env.example` | XAI_API_KEY / GROK_MODEL |
| `README.md` | 接入命令 + 自审说明 + 未来可选项 |

---

### Task 1: 项目脚手架

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`

- [ ] **Step 1: 写 `package.json`**

```json
{
  "name": "grok-search-mcp",
  "version": "0.1.0",
  "type": "module",
  "bin": { "grok-search-mcp": "dist/index.js" },
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "vitest run",
    "smoke": "node scripts/smoke.mjs"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "@types/node": "^22.0.0",
    "vitest": "^2.0.0"
  }
}
```

- [ ] **Step 2: 写 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "declaration": false,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: 写 `.gitignore`**

```
node_modules/
dist/
.env
```

- [ ] **Step 4: 安装依赖**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npm install`
Expected: 安装成功,生成 `node_modules/` 和 `package-lock.json`。

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json .gitignore package-lock.json
git commit -m "chore: scaffold grok-search-mcp project"
```

---

### Task 2: `grok.ts` 类型与 `buildInput`(纯函数)

**Files:**
- Create: `src/grok.ts`
- Test: `tests/grok.test.ts`

- [ ] **Step 1: 写失败测试 `tests/grok.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { buildInput } from "../src/grok.js";

describe("buildInput", () => {
  it("只有 query 时原样返回(trim)", () => {
    expect(buildInput({ query: "  谁赢了大选  " })).toBe("谁赢了大选");
  });
  it("带 recency 时追加时间约束", () => {
    const out = buildInput({ query: "AI 新闻", recency: "week" });
    expect(out).toContain("AI 新闻");
    expect(out).toContain("过去一周");
  });
  it("带 maxSources 时追加来源数量约束", () => {
    const out = buildInput({ query: "x", maxSources: 3 });
    expect(out).toContain("最多引用 3 个来源");
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: FAIL（`buildInput` 未导出 / 模块不存在）

- [ ] **Step 3: 写 `src/grok.ts`(类型 + buildInput)**

```ts
export interface GrokSearchParams {
  query: string;
  recency?: "day" | "week" | "month";
  maxSources?: number;
}

export interface Citation {
  title: string;
  url: string;
}

export interface GrokSearchResult {
  answer: string;
  citations: Citation[];
}

export interface GrokConfig {
  apiKey: string;
  model: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const RECENCY_LABEL: Record<NonNullable<GrokSearchParams["recency"]>, string> = {
  day: "过去一天",
  week: "过去一周",
  month: "过去一个月",
};

export function buildInput(params: GrokSearchParams): string {
  const parts = [params.query.trim()];
  const constraints: string[] = [];
  if (params.recency) {
    constraints.push(`优先使用${RECENCY_LABEL[params.recency]}内的信息。`);
  }
  if (params.maxSources && params.maxSources > 0) {
    constraints.push(`最多引用 ${params.maxSources} 个来源。`);
  }
  if (constraints.length > 0) {
    parts.push("\n\n" + constraints.join(""));
  }
  return parts.join("");
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: PASS（3 个用例通过）

- [ ] **Step 5: Commit**

```bash
git add src/grok.ts tests/grok.test.ts
git commit -m "feat: add grok types and buildInput"
```

---

### Task 3: `parseGrokResponse`(纯函数)

**Files:**
- Modify: `src/grok.ts`(追加导出)
- Test: `tests/grok.test.ts`(追加用例)

- [ ] **Step 1: 追加失败测试到 `tests/grok.test.ts`**

```ts
import { parseGrokResponse } from "../src/grok.js";

describe("parseGrokResponse", () => {
  const sample = {
    output: [
      { type: "reasoning", summary: "thinking..." },
      {
        type: "message",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: "Grok 4 已发布[[1]](https://x.ai/news)。",
            annotations: [
              { type: "url_citation", title: "1", url: "https://x.ai/news" },
            ],
          },
        ],
      },
    ],
  };

  it("提取答案文本与去重后的来源", () => {
    const r = parseGrokResponse(sample);
    expect(r.answer).toContain("Grok 4 已发布");
    expect(r.citations).toEqual([{ title: "1", url: "https://x.ai/news" }]);
  });

  it("没有 message 项或无文本时抛错", () => {
    expect(() => parseGrokResponse({ output: [{ type: "reasoning" }] })).toThrow();
  });

  it("无 citations 时返回空数组", () => {
    const r = parseGrokResponse({
      output: [
        { type: "message", content: [{ type: "output_text", text: "答案", annotations: [] }] },
      ],
    });
    expect(r.citations).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: FAIL（`parseGrokResponse` 未定义）

- [ ] **Step 3: 在 `src/grok.ts` 追加 `parseGrokResponse`**

```ts
export function parseGrokResponse(json: unknown): GrokSearchResult {
  const root = json as { output?: unknown };
  const output = Array.isArray(root.output) ? root.output : [];
  const message = output.find(
    (o): o is { content?: unknown } =>
      !!o && typeof o === "object" && (o as { type?: unknown }).type === "message"
  );
  const content = Array.isArray((message as { content?: unknown })?.content)
    ? ((message as { content: unknown[] }).content)
    : [];
  const textItem = content.find(
    (c): c is { text?: unknown; annotations?: unknown } =>
      !!c && typeof c === "object" && (c as { type?: unknown }).type === "output_text"
  );
  const answer = typeof (textItem as { text?: unknown })?.text === "string"
    ? ((textItem as { text: string }).text)
    : "";
  if (!answer) {
    throw new Error("Grok 响应中未找到答案文本");
  }
  const annotations = Array.isArray((textItem as { annotations?: unknown })?.annotations)
    ? ((textItem as { annotations: unknown[] }).annotations)
    : [];
  const seen = new Set<string>();
  const citations: Citation[] = [];
  for (const a of annotations) {
    const ann = a as { type?: unknown; url?: unknown; title?: unknown };
    if (ann?.type === "url_citation" && typeof ann.url === "string" && !seen.has(ann.url)) {
      seen.add(ann.url);
      citations.push({
        title: typeof ann.title === "string" ? ann.title : ann.url,
        url: ann.url,
      });
    }
  }
  return { answer, citations };
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: PASS（全部用例通过）

- [ ] **Step 5: Commit**

```bash
git add src/grok.ts tests/grok.test.ts
git commit -m "feat: parse Grok responses API output and citations"
```

---

### Task 4: `callGrokSearch`(注入 fetch,测 HTTP 与错误)

**Files:**
- Modify: `src/grok.ts`(追加 `buildRequestBody` 和 `callGrokSearch`)
- Test: `tests/grok.test.ts`(追加用例)

- [ ] **Step 1: 追加失败测试**

```ts
import { callGrokSearch, buildRequestBody } from "../src/grok.js";

describe("buildRequestBody", () => {
  it("组装 model/input/tools", () => {
    const body = buildRequestBody({ query: "hi" }, "grok-4.3");
    expect(body.model).toBe("grok-4.3");
    expect(body.input[0]).toMatchObject({ role: "user" });
    expect(body.tools).toEqual([{ type: "web_search" }, { type: "x_search" }]);
  });
});

describe("callGrokSearch", () => {
  it("成功时解析答案", async () => {
    const fakeFetch = async () =>
      new Response(
        JSON.stringify({
          output: [
            { type: "message", content: [{ type: "output_text", text: "答案", annotations: [] }] },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    const r = await callGrokSearch(
      { query: "q" },
      { apiKey: "k", model: "grok-4.3", fetchImpl: fakeFetch as typeof fetch }
    );
    expect(r.answer).toBe("答案");
  });

  it("非 2xx 时抛出含状态码的错误", async () => {
    const fakeFetch = async () =>
      new Response("bad key", { status: 401, statusText: "Unauthorized" });
    await expect(
      callGrokSearch({ query: "q" }, { apiKey: "k", model: "grok-4.3", fetchImpl: fakeFetch as typeof fetch })
    ).rejects.toThrow("401");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: FAIL（`callGrokSearch` / `buildRequestBody` 未定义）

- [ ] **Step 3: 在 `src/grok.ts` 追加实现**

```ts
const DEFAULT_BASE_URL = "https://api.x.ai/v1";

export function buildRequestBody(params: GrokSearchParams, model: string) {
  return {
    model,
    input: [{ role: "user", content: buildInput(params) }],
    tools: [{ type: "web_search" }, { type: "x_search" }],
  };
}

export async function callGrokSearch(
  params: GrokSearchParams,
  config: GrokConfig
): Promise<GrokSearchResult> {
  const doFetch = config.fetchImpl ?? fetch;
  const baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
  const res = await doFetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(buildRequestBody(params, config.model)),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`xAI API 错误 ${res.status}: ${detail || res.statusText}`);
  }
  const json = await res.json();
  return parseGrokResponse(json);
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/grok.test.ts`
Expected: PASS（全部用例通过）

- [ ] **Step 5: Commit**

```bash
git add src/grok.ts tests/grok.test.ts
git commit -m "feat: add callGrokSearch HTTP call with error handling"
```

---

### Task 5: `format.ts`

**Files:**
- Create: `src/format.ts`
- Test: `tests/format.test.ts`

- [ ] **Step 1: 写失败测试 `tests/format.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { formatResult } from "../src/format.js";

describe("formatResult", () => {
  it("无来源时只返回答案", () => {
    expect(formatResult({ answer: "答案", citations: [] })).toBe("答案");
  });
  it("有来源时追加编号来源列表", () => {
    const out = formatResult({
      answer: "答案",
      citations: [{ title: "1", url: "https://a.com" }],
    });
    expect(out).toContain("答案");
    expect(out).toContain("来源");
    expect(out).toContain("https://a.com");
  });
  it("标题非纯数字时同时显示标题", () => {
    const out = formatResult({
      answer: "x",
      citations: [{ title: "xAI 官网", url: "https://x.ai" }],
    });
    expect(out).toContain("xAI 官网");
    expect(out).toContain("https://x.ai");
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/format.test.ts`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 写 `src/format.ts`**

```ts
import type { GrokSearchResult } from "./grok.js";

export function formatResult(result: GrokSearchResult): string {
  if (result.citations.length === 0) {
    return result.answer;
  }
  const lines = result.citations.map((c, i) => {
    const n = i + 1;
    const isNumberTitle = c.title === String(n) || /^\d+$/.test(c.title);
    return isNumberTitle ? `${n}. ${c.url}` : `${n}. ${c.title} — ${c.url}`;
  });
  return `${result.answer}\n\n---\n来源:\n${lines.join("\n")}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx vitest run tests/format.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/format.ts tests/format.test.ts
git commit -m "feat: add result formatter with source list"
```

---

### Task 6: `index.ts` MCP server 接线

**Files:**
- Create: `src/index.ts`

> **SDK 版本说明:** 下方使用 `@modelcontextprotocol/sdk` 的 `McpServer.registerTool(name, config, handler)` 现代签名。Step 3 之后运行 `npx tsc --noEmit` 以已安装版本的 `.d.ts` 为准;若该版本仅提供旧签名 `server.tool(name, description, schemaObj, handler)`,按类型定义把 registerTool 调用改为 tool 调用(参数同为 name/描述/zod schema 对象/handler),其余逻辑不变。

- [ ] **Step 1: 写 `src/index.ts`**

```ts
#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { callGrokSearch } from "./grok.js";
import { formatResult } from "./format.js";

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.error("[grok-search-mcp] 缺少 XAI_API_KEY 环境变量,无法启动。");
  process.exit(1);
}
const model = process.env.GROK_MODEL ?? "grok-4.3";

const server = new McpServer({ name: "grok-search-mcp", version: "0.1.0" });

server.registerTool(
  "grok_search",
  {
    title: "Grok 实时搜索",
    description:
      "用 xAI Grok 实时搜索网页和 X(Twitter),返回综合答案与来源。Grok 自动决定使用哪些数据源。",
    inputSchema: {
      query: z.string().describe("搜索或提问内容"),
      recency: z.enum(["day", "week", "month"]).optional().describe("时间偏好"),
      max_sources: z.number().int().positive().optional().describe("引用来源数量上限"),
    },
  },
  async ({ query, recency, max_sources }) => {
    try {
      const result = await callGrokSearch(
        { query, recency, maxSources: max_sources },
        { apiKey, model }
      );
      return { content: [{ type: "text", text: formatResult(result) }] };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { content: [{ type: "text", text: `搜索失败:${msg}` }], isError: true };
    }
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: 类型检查**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx tsc --noEmit`
Expected: 无类型错误。若 `registerTool` 签名报错,按文件顶部 SDK 版本说明改为 `server.tool(...)`,重跑直至通过。

- [ ] **Step 3: 构建**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npm run build`
Expected: 生成 `dist/index.js`、`dist/grok.js`、`dist/format.js`。

- [ ] **Step 4: 启动冒烟(无 key 应明确报错)**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && node dist/index.js`
Expected: 因未设 XAI_API_KEY,打印 "缺少 XAI_API_KEY" 并以非零码退出(验证错误分支)。

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire up MCP server with grok_search tool"
```

---

### Task 7: 冒烟脚本 + 配置 + 文档

**Files:**
- Create: `scripts/smoke.mjs`, `.env.example`, `README.md`

- [ ] **Step 1: 写 `scripts/smoke.mjs`**

```js
// 端到端冒烟:真实打一次官方 API。需要 XAI_API_KEY。
// 用法: XAI_API_KEY=xai-... npm run smoke
import { callGrokSearch } from "../dist/grok.js";
import { formatResult } from "../dist/format.js";

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.log("跳过冒烟:未设置 XAI_API_KEY。");
  process.exit(0);
}
const model = process.env.GROK_MODEL ?? "grok-4.3";
const result = await callGrokSearch(
  { query: "xAI 最近发布了什么?", recency: "week" },
  { apiKey, model }
);
console.log(formatResult(result));
```

- [ ] **Step 2: 写 `.env.example`**

```
# 官方 xAI API Key,从 https://console.x.ai 获取
XAI_API_KEY=xai-your-key-here
# 可选:模型名,默认 grok-4.3。可用模型见 https://docs.x.ai/developers/models
GROK_MODEL=grok-4.3
```

- [ ] **Step 3: 写 `README.md`**

````markdown
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

## 冒烟测试

```bash
XAI_API_KEY=xai-你的key npm run smoke
```

## 设计与可审计性

- 运行时依赖仅:`@modelcontextprotocol/sdk`(官方)、`zod`。
- 所有对 xAI 的请求都在 `src/grok.ts` 一处,用原生 fetch,可逐行审计。

## 未来可选项(本期未实现)

- `session_id` + 懒加载来源:先只返回答案省 token,需要时再按 id 取详细来源。
````

- [ ] **Step 4: Commit**

```bash
git add scripts/smoke.mjs .env.example README.md
git commit -m "docs: add smoke script, env example, and README"
```

---

### Task 8: 全量验证 + 接入实测

- [ ] **Step 1: 跑全部单测**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npm test`
Expected: 全部 PASS。

- [ ] **Step 2: 类型检查 + 构建**

Run: `cd /Users/nio/project/nanafox/grok-search-mcp && npx tsc --noEmit && npm run build`
Expected: 无错误,dist 生成。

- [ ] **Step 3:(需 key)接入 Claude Code 并实测**

```bash
claude mcp add grok-search -e XAI_API_KEY=xai-你的key \
  -- node /Users/nio/project/nanafox/grok-search-mcp/dist/index.js
```
在 Claude Code 中 `/mcp` 确认 `grok_search` 出现,实际搜一次,确认返回答案 + 至少一条来源。

> 若此刻还没有 XAI_API_KEY:跳过 Step 3,前两步通过即视为代码完成;待拿到 key 后再做 Step 3。

---

## 成功标准

1. `npm test` 全绿(buildInput / parseGrokResponse / buildRequestBody / callGrokSearch / formatResult 覆盖)
2. `npx tsc --noEmit` 与 `npm run build` 无错误
3. 无 key 启动 `node dist/index.js` 能明确报错退出(错误分支)
4. (有 key 时)`/mcp` 出现 `grok_search` 且实搜返回答案 + 来源
