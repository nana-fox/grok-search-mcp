import type { GrokSearchResult } from "./grok.js";

export function formatResult(result: GrokSearchResult): string {
  if (result.citations.length === 0) {
    return result.answer;
  }
  const lines = result.citations.map((c, i) => {
    const n = i + 1;
    const isNumberTitle = c.title === String(n);
    return isNumberTitle ? `${n}. ${c.url}` : `${n}. ${c.title} — ${c.url}`;
  });
  return `${result.answer}\n\n---\n来源:\n${lines.join("\n")}`;
}
