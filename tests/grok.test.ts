import { describe, it, expect } from "vitest";
import { buildInput, parseGrokResponse, callGrokSearch, buildRequestBody } from "../src/grok.js";

describe("buildInput", () => {
  it("只有 query 时原样返回(trim)", () => {
    expect(buildInput({ query: "  谁赢了大选  " })).toBe("谁赢了大选");
  });
  it("带 recency 时追加时间约束", () => {
    const out = buildInput({ query: "AI 新闻", recency: "week" });
    expect(out).toBe("AI 新闻\n\n优先使用过去一周内的信息。");
  });
  it("带 maxSources 时追加来源数量约束", () => {
    const out = buildInput({ query: "x", maxSources: 3 });
    expect(out).toBe("x\n\n最多引用 3 个来源。");
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

  it("未配置 baseUrl 时打官方 endpoint", async () => {
    let calledUrl = "";
    const fakeFetch = async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "答案", annotations: [] }] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    await callGrokSearch({ query: "q" }, { apiKey: "k", model: "grok-4.3", fetchImpl: fakeFetch as typeof fetch });
    expect(calledUrl).toBe("https://api.x.ai/v1/responses");
  });

  it("配置 baseUrl(中转站)时打自定义 endpoint", async () => {
    let calledUrl = "";
    const fakeFetch = async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "答案", annotations: [] }] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    await callGrokSearch(
      { query: "q" },
      { apiKey: "k", model: "grok-4.3", baseUrl: "https://relay.example.com/v1", fetchImpl: fakeFetch as typeof fetch }
    );
    expect(calledUrl).toBe("https://relay.example.com/v1/responses");
  });

  it("baseUrl 带尾斜杠时归一化,避免双斜杠", async () => {
    let calledUrl = "";
    const fakeFetch = async (url: string | URL) => {
      calledUrl = String(url);
      return new Response(
        JSON.stringify({ output: [{ type: "message", content: [{ type: "output_text", text: "答案", annotations: [] }] }] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    await callGrokSearch(
      { query: "q" },
      { apiKey: "k", model: "grok-4.3", baseUrl: "https://relay.example.com/v1/", fetchImpl: fakeFetch as typeof fetch }
    );
    expect(calledUrl).toBe("https://relay.example.com/v1/responses");
  });
});
