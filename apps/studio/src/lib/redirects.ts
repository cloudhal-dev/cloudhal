import type { ContentEntry, Page, Redirect, Taxonomy, Term } from "@cloudhal/core-contracts";

/**
 * Manual redirects in Studio (RFC-0002 invariant 14). The patterns are the contract's
 * (`redirect.schema.json`); the served-path, duplicate and loop checks mirror core-ts, so a
 * person sees why before the server refuses.
 */
export const REDIRECT_LIMITS = { fromMax: 1024, toMax: 2048, noteMax: 500 } as const;
const FROM = /^\/(?:[^\s?#/\\]+(?:\/[^\s?#/\\]+)*)?$/;
const TO = /^(?:\/(?![/\\])[^\s\\]*|https:\/\/[^\s\\/?#]+(?:[/?#][^\s\\]*)?)$/;

export type FromError = "required" | "invalid" | "tooLong" | "taken" | "served";
export type ToError = "required" | "invalid" | "insecure" | "tooLong" | "self" | "loop";

/**
 * What a person typed as the old address, as a path: a pasted URL keeps only its path, a missing
 * leading slash is added and a trailing slash dropped (root excepted).
 */
export function normaliseFrom(input: string): string {
  let v = input.trim();
  if (/^https?:\/\//i.test(v)) {
    try {
      v = new URL(v).pathname;
    } catch {
      return v;
    }
  }
  if (v && !v.startsWith("/")) v = `/${v}`;
  if (v.length > 1) v = v.replace(/\/+$/, "");
  return v;
}

/** The host of an external (https) target; undefined for a site path. */
export function externalHost(to: string): string | undefined {
  if (!/^https:\/\//i.test(to.trim())) return undefined;
  try {
    return new URL(to.trim()).host;
  } catch {
    return undefined;
  }
}

/** The path part of a site-path target (`/a?b#c` → `/a`). */
function pathOf(to: string): string | undefined {
  if (!to.startsWith("/")) return undefined;
  return to.split(/[?#]/)[0] ?? to;
}

/** Paths the site serves now (a redirect may never shadow one): pages, published articles, public term archives. */
export function servedPaths(input: {
  pages: readonly Pick<Page, "path">[];
  entries: readonly Pick<ContentEntry, "collection" | "slug" | "status" | "locale">[];
  defaultLocale: string;
  taxonomies: readonly Pick<Taxonomy, "id" | "archive">[];
  terms: readonly Pick<Term, "taxonomyId" | "slug" | "status" | "visibility">[];
}): Set<string> {
  const out = new Set(input.pages.map((p) => p.path));
  for (const e of input.entries)
    if (e.status === "published" && e.locale === input.defaultLocale)
      out.add(`/${e.collection}/${e.slug}`);
  for (const tax of input.taxonomies) {
    if (!tax.archive.enabled) continue;
    for (const term of input.terms)
      if (term.taxonomyId === tax.id && term.status === "active" && term.visibility === "public")
        out.add(`${tax.archive.basePath}/${term.slug}`);
  }
  return out;
}

/** Where `path` ends up after the existing redirects (exact first, then the longest prefix). */
function follow(redirects: readonly Redirect[], path: string, hops = 25): string[] {
  const seen: string[] = [];
  let cur: string | undefined = path;
  while (cur && hops-- > 0) {
    seen.push(cur);
    const exact = redirects.find((r) => r.from === cur);
    let next: string | undefined;
    if (exact) next = pathOf(exact.to);
    else {
      const prefix = redirects
        .filter((r) => r.match === "prefix" && cur?.startsWith(`${r.from}/`))
        .sort((a, b) => b.from.length - a.from.length)[0];
      if (prefix) {
        const base = pathOf(prefix.to);
        next = base !== undefined ? `${base}${cur.slice(prefix.from.length)}` : undefined;
      }
    }
    if (next === undefined || seen.includes(next)) {
      if (next !== undefined) seen.push(next);
      break;
    }
    cur = next;
  }
  return seen;
}

export interface RedirectDraft {
  from: string;
  to: string;
}

export function validateRedirect(
  draft: RedirectDraft,
  context: { redirects: readonly Redirect[]; served: ReadonlySet<string>; selfId?: string },
): { from?: FromError; to?: ToError } {
  const errors: { from?: FromError; to?: ToError } = {};
  const from = draft.from;
  const to = draft.to.trim();
  const others = context.redirects.filter((r) => r.id !== context.selfId);
  if (!from) errors.from = "required";
  else if (from.length > REDIRECT_LIMITS.fromMax) errors.from = "tooLong";
  else if (!FROM.test(from)) errors.from = "invalid";
  else if (!context.selfId && others.some((r) => r.from === from)) errors.from = "taken";
  else if (context.served.has(from)) errors.from = "served";
  if (!to) errors.to = "required";
  else if (to.length > REDIRECT_LIMITS.toMax) errors.to = "tooLong";
  else if (/^http:\/\//i.test(to)) errors.to = "insecure";
  else if (!TO.test(to)) errors.to = "invalid";
  else if (pathOf(to) === from) errors.to = "self";
  else {
    const target = pathOf(to);
    if (target !== undefined && from && follow(others, target).includes(from)) errors.to = "loop";
  }
  return errors;
}
