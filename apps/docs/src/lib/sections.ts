/**
 * cloudhal.dev's sections for agents (ADR-0039): each has its own `llms.txt`, and `search_docs`
 * on the docs MCP can be limited to one. Build-time only.
 */
import type { Page } from "./pages.ts";
import { ORIGIN } from "./repo-docs.ts";

/** Sections with their own `llms.txt`, in index order. */
export const SECTIONS = [
  { key: "start", prefix: "docs/start/", title: "Start" },
  { key: "agents", prefix: "docs/agents", title: "Agents and MCP" },
  { key: "reference", prefix: "docs/reference/", title: "Reference" },
  { key: "guides", prefix: "docs/guides/", title: "Guides" },
  { key: "contributing", prefix: "docs/", title: "Contributing and internals" },
  { key: "adr", prefix: "docs/adr", title: "Architecture decisions" },
  { key: "rfcs", prefix: "docs/rfcs", title: "Proposals" },
] as const;

export type Section = (typeof SECTIONS)[number];

export function sectionOf(page: Page): Section | undefined {
  if (!page.id.startsWith("docs/")) return undefined;
  return SECTIONS.find((s) =>
    s.key === "contributing"
      ? !/^docs\/(start|agents|reference|guides|adr|rfcs)(\/|$)/.test(page.id)
      : page.id === s.prefix || page.id.startsWith(s.prefix),
  );
}

export const urlOf = (page: Page) => (page.id === "index" ? `${ORIGIN}/` : `${ORIGIN}/${page.id}`);
