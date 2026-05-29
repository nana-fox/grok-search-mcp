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
    // 缺少答案文本无法恢复:这是核心返回值,直接抛错。
    throw new Error("Grok 响应中未找到答案文本");
  }
  // 缺少 annotations(来源)是可接受的:回退为空列表,不抛错。
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
