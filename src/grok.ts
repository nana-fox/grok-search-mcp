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
