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
  it("纯数字但非编号的标题不被抑制", () => {
    const out = formatResult({ answer: "x", citations: [{ title: "2024", url: "https://a.com" }] });
    expect(out).toContain("2024");
    expect(out).toContain("https://a.com");
  });
});
