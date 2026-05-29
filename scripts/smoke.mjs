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
