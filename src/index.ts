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
// grok-4.3 是 xAI 当前官方旗舰默认模型(见 https://docs.x.ai/developers/models);GROK_MODEL 可覆盖。
const model = process.env.GROK_MODEL ?? "grok-4.3";
// 可选:指向第三方中转站(如 NanaFocus),只要它兼容 xAI Responses API。
// 不设则用官方默认 https://api.x.ai/v1。空字符串视为未设置。
const baseUrl = process.env.XAI_BASE_URL || undefined;

const server = new McpServer({ name: "grok-search-mcp", version: "0.1.0" });

server.registerTool(
  "grok_search",
  {
    title: "Grok 实时搜索",
    description:
      "当需要实时/最新信息,或 X(Twitter)上的社交、舆论、突发内容时,用 xAI Grok 搜索实时网页和 X,返回综合答案与带链接的来源。Grok 自动决定使用哪些数据源。",
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
        { apiKey, model, baseUrl }
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
