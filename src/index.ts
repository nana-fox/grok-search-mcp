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
