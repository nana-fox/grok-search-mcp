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
