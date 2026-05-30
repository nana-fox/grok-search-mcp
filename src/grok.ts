import { EnvHttpProxyAgent, setGlobalDispatcher } from "undici";

// Node 的原生 fetch 默认忽略 HTTP(S)_PROXY 环境变量,会直连。
// 在需要代理出网的环境(如直连 api.x.ai 不通时),显式让 fetch 走环境变量里的代理。
// 无代理 env 时,EnvHttpProxyAgent 表现为普通直连,安全无副作用。
setGlobalDispatcher(new EnvHttpProxyAgent());

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
  timeoutMs?: number;
  retries?: number;
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
// Grok 的"边搜边推理"是非流式一次性返回,实测常需几十秒,30s 会误杀慢请求。
// 官方对推理模型建议把超时调到分钟级(见 docs.x.ai streaming 指南),这里默认 120s,可经 config 覆盖。
const DEFAULT_TIMEOUT_MS = 120_000;
// 5xx/429 多为上游(xAI 或中转站)瞬时不可用,可重试;默认额外重试 2 次。
const DEFAULT_RETRIES = 2;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
// 指数退避:300ms、600ms、1200ms…上限 4s。
function backoffMs(attempt: number): number {
  return Math.min(300 * 2 ** attempt, 4000);
}
// 优先采用响应里的 Retry-After(秒);无则用退避。
function retryDelayMs(res: Response, attempt: number): number {
  const header = res.headers.get("retry-after");
  const sec = header ? Number(header) : NaN;
  return Number.isFinite(sec) ? sec * 1000 : backoffMs(attempt);
}

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
  // 去掉尾部斜杠,避免 baseUrl 带 "/" 时拼出 "//responses"(中转站 URL 常带尾斜杠)。
  const baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxRetries = config.retries ?? DEFAULT_RETRIES;
  const url = `${baseUrl}/responses`;
  const body = JSON.stringify(buildRequestBody(params, config.model));

  let lastError: Error = new Error("搜索失败");
  // attempt 从 0 起,共最多 maxRetries+1 次。
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    let res: Response;
    try {
      res = await doFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      // 主动超时:已等满 timeoutMs,不重试,直接报错。
      if (timedOut) throw new Error(`搜索超时(${timeoutMs}ms)`);
      // 其它网络错误:可重试。
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      throw lastError;
    } finally {
      clearTimeout(timer);
    }

    if (res.ok) {
      const json = await res.json();
      return parseGrokResponse(json);
    }

    const detail = await res.text().catch(() => "");
    const error = new Error(`xAI API 错误 ${res.status}: ${detail || res.statusText}`);
    // 5xx/429 是上游瞬时不可用,可重试;4xx(如 401 key 错)直接抛,不浪费重试。
    if (RETRYABLE_STATUS.has(res.status) && attempt < maxRetries) {
      lastError = error;
      await sleep(retryDelayMs(res, attempt));
      continue;
    }
    throw error;
  }
  throw lastError;
}
