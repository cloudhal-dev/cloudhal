import type { Context } from "hono";

/**
 * Serves a rendered preview document. Previews include drafts, so they are private (no caching)
 * and sandboxed: no scripts, no framing by other origins, nothing leaves the page.
 */
export function previewResponse(c: Context, html: string): Response {
  return c.body(html, 200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "private, no-store",
    "content-security-policy":
      "default-src 'none'; img-src https: data:; style-src 'unsafe-inline'; frame-ancestors 'self'; base-uri 'none'; form-action 'none'; sandbox",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
}

/**
 * What a draft preview (`POST …/preview`) answers: the document for the editor's `srcDoc`. The
 * editor's sandboxed iframe enforces what the headers above do for a served preview.
 */
export interface DraftPreview {
  html: string;
}
