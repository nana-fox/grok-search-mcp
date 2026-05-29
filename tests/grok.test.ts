import { describe, it, expect } from "vitest";
import { buildInput, parseGrokResponse } from "../src/grok.js";

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
