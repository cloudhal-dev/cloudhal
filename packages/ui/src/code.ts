/**
 * @cloudhal/ui/code — Kumo's syntax-highlighted code blocks (`CodeHighlighted`, `ShikiProvider`).
 * A separate entry so screens that never show code don't pull in the highlighter; Shiki itself and
 * every grammar load lazily.
 */
export * from "@cloudflare/kumo/code";
