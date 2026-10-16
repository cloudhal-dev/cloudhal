/**
 * `render_page` (RFC-0021 §4): an agent looks at what it built. The page's draft opens through its
 * preview link in a real browser at desktop, tablet and phone widths; the result is screenshots
 * (one viewport each, so they stay readable) and automatic checks that name the section and
 * component behind each problem. Read-only: nothing is stored, and the preview link expires.
 */

import {
  id,
  obj,
  type ToolContent,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";
import {
  bytesToBase64,
  RENDER_CHECK_IDS,
  RENDER_WIDTHS,
  type RenderCheck,
  RenderError,
  RenderLimiter,
  type RenderWidth,
  renderPage,
} from "./render.ts";

type PreviewDoc = (
  args: Record<string, unknown>,
  ctx: ToolContext,
) => Promise<{ title: string; path: string; url: string | null }>;

/** Shared by every server in this process (or Worker isolate) unless a deployment brings its own. */
const SHARED_LIMITER = new RenderLimiter();

interface RenderPageResult {
  url: string;
  path: string;
  widths: { width: number; height: number; truncated: boolean; images: number }[];
  checks: RenderCheck[];
  /** The screenshots, per width; moved into image content, never into structured content. */
  images?: { width: number; jpegs: Uint8Array[] }[];
}

const WHAT: Record<(typeof RENDER_CHECK_IDS)[number], string> = {
  "overflow-x": "scrolls sideways",
  "img-alt": "images without alt text",
  "img-broken": "images that did not load",
  "heading-order": "heading levels",
  contrast: "text contrast",
  "empty-section": "empty sections",
  "tap-target": "small tap targets",
  "long-line": "long lines",
  "input-label": "unlabelled inputs",
  "chart-empty": "empty charts",
};

function summary(r: RenderPageResult): string {
  const failed = r.checks.filter((c) => !c.ok);
  return [
    `Rendered ${r.path} (the draft) at ${r.widths.map((w) => `${w.width}`).join(", ")} px.`,
    ...r.widths.map(
      (w) =>
        `${w.width} px: ${w.images} screenshot(s) of a ${w.height} px page${w.truncated ? " (truncated: the screenshots stop there; preview_page has the whole page as HTML)" : ""}.`,
    ),
    failed.length
      ? `Checks: ${failed.length} of ${r.checks.length} found problems.`
      : `Checks: all ${r.checks.length} passed.`,
    ...failed.map(
      (c) =>
        `✗ ${c.id} (${WHAT[c.id]}): ${c.count} at ${c.widths.join(", ")} px\n${c.examples.map((e) => `  - ${e}`).join("\n")}`,
    ),
    ...(failed.length
      ? [
          "Fix what you can in the draft (examples name the section and component), render again, and tell the person about anything you leave.",
        ]
      : []),
  ].join("\n");
}

export function renderTools(previewDoc: PreviewDoc): ToolDefinition[] {
  return [
    {
      name: "render_page",
      title: "Render a page in a browser",
      description:
        "Look at a page's draft as people will see it: renders it in a real browser at desktop (1440), tablet (768) and phone (390) widths and returns screenshots plus automatic checks (sideways scrolling, alt text, broken images, heading order, text contrast, empty sections, tap targets, line length) that name the section and component behind each problem. Use it after building or changing a page and before asking a person to publish; fix what it finds and render again. Read-only. Rate-limited (about 10 a minute); when no browser is available, use preview_page.",
      inputSchema: obj(
        {
          siteId: id,
          pageId: id,
          entryId: id,
          widths: {
            type: "array",
            items: { type: "integer", enum: [...RENDER_WIDTHS] },
            minItems: 1,
            maxItems: 3,
            uniqueItems: true,
            description: "Default [1440, 390]",
          },
          fullPage: {
            type: "boolean",
            description: "Screenshots down the page, up to 4 per width (default true)",
          },
        },
        ["siteId"],
      ),
      outputSchema: obj(
        {
          url: { type: "string" },
          path: { type: "string" },
          widths: {
            type: "array",
            items: obj(
              {
                width: { type: "integer" },
                height: { type: "integer" },
                truncated: { type: "boolean" },
                images: { type: "integer" },
              },
              ["width", "height", "truncated", "images"],
            ),
          },
          checks: {
            type: "array",
            items: obj(
              {
                id: { type: "string", enum: [...RENDER_CHECK_IDS] },
                ok: { type: "boolean" },
                count: { type: "integer" },
                examples: { type: "array", items: { type: "string" } },
                widths: { type: "array", items: { type: "integer" } },
              },
              ["id", "ok", "count", "examples", "widths"],
            ),
          },
        },
        ["url", "path", "widths", "checks"],
      ),
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
      scopes: ["preview:create"],
      renderContent: (raw) => {
        const { images = [], ...structured } = raw as RenderPageResult;
        const content: ToolContent[] = [{ type: "text", text: summary(structured) }];
        for (const shot of images) {
          shot.jpegs.forEach((jpeg, i) => {
            content.push({
              type: "text",
              text: `${shot.width} px, screenshot ${i + 1} of ${shot.jpegs.length}:`,
            });
            content.push({ type: "image", data: bytesToBase64(jpeg), mimeType: "image/jpeg" });
          });
        }
        return { content, structured: structured as unknown as Record<string, unknown> };
      },
      handler: async (a, ctx) => {
        if (!a.pageId && !a.entryId) throw new ToolError("invalid", "pass pageId or entryId");
        const doc = await previewDoc(a, ctx);
        if (!ctx.render)
          throw new ToolError(
            "render_unavailable",
            `this server has no browser for render_page; use preview_page${doc.url ? ` or open ${doc.url}` : ""}`,
            { url: doc.url },
          );
        if (!doc.url)
          throw new ToolError(
            "render_unavailable",
            "this page has no preview link to open (the site has no domain and no `cloudhal dev` is running); use preview_page",
          );
        const limiter = ctx.render.limiter ?? SHARED_LIMITER;
        const refused = limiter.take(
          ctx.principal.actor.id,
          a.siteId as string,
          ctx.now?.() ?? new Date(),
        );
        if (refused) throw new ToolError("render_limited", refused);
        const widths = (
          Array.isArray(a.widths) && a.widths.length ? a.widths : [1440, 390]
        ) as RenderWidth[];
        try {
          const r = await renderPage(ctx.render.renderer, doc.url, {
            widths,
            fullPage: a.fullPage !== false,
            timeoutMs: ctx.render.timeoutMs ?? 20_000,
          });
          const result: RenderPageResult = {
            url: doc.url,
            path: doc.path,
            widths: r.shots.map((s) => ({
              width: s.width,
              height: s.height,
              truncated: s.truncated,
              images: s.images.length,
            })),
            checks: r.checks,
            images: r.shots.map((s) => ({ width: s.width, jpegs: s.images })),
          };
          return result;
        } catch (e) {
          if (e instanceof RenderError)
            throw new ToolError("render_failed", `${e.message}; use preview_page instead`, {
              url: doc.url,
            });
          throw e;
        }
      },
    },
  ];
}
