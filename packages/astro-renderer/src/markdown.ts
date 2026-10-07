import { marked } from "marked";

/**
 * Renders markdown to HTML. Trusted authors only for now; sanitisation of HTML-format bodies and
 * agent-written markdown is a Sprint 5 policy concern (tracked in RFC-0001 open questions).
 */
export function renderMarkdown(source: string): string {
  return marked.parse(source, { async: false, gfm: true }) as string;
}

export function renderBody(body: { format: "markdown" | "html"; value: string }): string {
  return body.format === "markdown" ? renderMarkdown(body.value) : body.value;
}
