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
