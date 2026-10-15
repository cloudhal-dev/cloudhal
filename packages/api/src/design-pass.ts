/**
 * The design pass (RFC-0021 phase 21c): a built page is rendered (`render_page`'s browser and
 * checks), shown to the model that built it once per Build chat turn, and in the Build model eval
 * scored by a vision model against a short rubric. Images go only to models that take them;
 * the others get the checks as text. Worker-safe.
 */
import { DESIGN_GUIDANCE } from "@cloudhal/core-ts/design";
import {
  bytesToBase64,
  type PageRenderer,
  type RenderCheck,
  type RenderWidth,
  renderPage,
} from "@cloudhal/mcp-server/render";
import type { AiContentPart, AiMessage, AiTransport, AiUsage } from "./ai/client.ts";
import { lenientJson } from "./build-turn.ts";

/**
 * Workers AI models that take images in messages (`image_url` data URLs), checked on Workers AI
 * on 2026-10-15. Others get the checks as text only.
 */
export const VISION_MODELS: readonly string[] = [
  "@cf/meta/llama-4-scout-17b-16e-instruct",
  "@cf/mistralai/mistral-small-3.1-24b-instruct",
  "@cf/google/gemma-3-12b-it",
];

/** The judge the eval uses by default: fast, reads text in screenshots well. */
export const DESIGN_JUDGE_MODEL = "@cf/meta/llama-4-scout-17b-16e-instruct";

export const acceptsImages = (model: string): boolean => VISION_MODELS.includes(model);

/** What a render shows a model: the failed checks and a few screenshots. */
export interface PageLook {
  failed: RenderCheck[];
  /** JPEG data URLs, desktop first. */
  images: { width: number; url: string }[];
}

/** The page as HTML in a data URL (pages that are not stored, or a site without a domain). */
export function htmlDataUrl(html: string, base?: string): string {
  const doc = base ? html.replace(/<head>/i, `<head><base href="${base}">`) : html;
  return `data:text/html;base64,${bytesToBase64(new TextEncoder().encode(doc))}`;
}

/**
 * Renders the page at desktop and phone width: the failed checks, and the first screenshots of
 * each width (two by default: what a reader sees first, where design matters most).
 */
export async function lookAt(
  renderer: PageRenderer,
  url: string,
  options: { widths?: readonly RenderWidth[]; images?: number; timeoutMs?: number } = {},
): Promise<PageLook> {
  const per = options.images ?? 2;
  const r = await renderPage(renderer, url, {
    widths: options.widths ?? [1440, 390],
    fullPage: per > 1,
    maxImages: Math.max(1, per),
    quality: 50,
    timeoutMs: options.timeoutMs ?? 30_000,
  });
  return {
    failed: r.checks.filter((c) => !c.ok),
    images: r.shots.flatMap((s) =>
      s.images
        .slice(0, per)
        .map((jpeg) => ({ width: s.width, url: `data:image/jpeg;base64,${bytesToBase64(jpeg)}` })),
    ),
  };
}

const checkLines = (failed: readonly RenderCheck[]): string[] =>
  failed.length === 0
    ? ["All automatic checks passed."]
    : [
        "Automatic checks that failed:",
        ...failed.map(
          (c) =>
            `- ${c.id}: ${c.count} at ${c.widths.join(", ")} px${c.examples.length ? ` (${c.examples.slice(0, 3).join("; ")})` : ""}`,
        ),
      ];

/** Build chat's look (once per turn): the render, and what to do about it. */
export function lookMessage(look: PageLook, images: boolean): AiMessage {
  const text = [
    images
      ? `This is your page rendered in a browser: ${look.images.map((i) => `${i.width} px`).join(", ")} (top of the page first).`
      : "Your page was rendered in a browser at 1440 and 390 px.",
    ...checkLines(look.failed),
    images
      ? "Look at it as a designer: hierarchy, rhythm between sections, spacing, contrast, anything cramped, empty or broken, and whether it follows the design rules."
      : "",
    'If something should change, send JSON Lines that fix it, then {"done":true}. If the page is good, send only {"done":true}.',
  ]
    .filter(Boolean)
    .join("\n");
  if (!images || look.images.length === 0) return { role: "user", content: text };
  const parts: AiContentPart[] = [{ type: "text", text }];
  for (const i of look.images) parts.push({ type: "image_url", image_url: { url: i.url } });
  return { role: "user", content: parts };
}

// ── the rubric (the eval's design score) ─────────────────────────────────────────────────────

/** What the judge scores, 1 (poor) to 5 (excellent). */
export const DESIGN_RUBRIC = [
  { id: "fidelity", question: "Does the page do what the brief asked, with nothing missing?" },
  {
    id: "hierarchy",
    question:
      "Is it clear what matters most: one main heading, strong contrast between headings and text, one primary action per section?",
  },
  {
    id: "rhythm",
    question:
      "Do sections vary in tone, width and layout, without three identical blocks in a row?",
  },
  {
    id: "spacing",
    question: "Is spacing even and generous, with nothing cramped, overlapping or awkwardly empty?",
  },
  {
    id: "readability",
    question: "Is all text easy to read at both widths (size, contrast, line length)?",
  },
  {
    id: "mobile",
    question: "Does the phone layout work: stacked sensibly, nothing cut off or too small?",
  },
] as const;

export type DesignCriterion = (typeof DESIGN_RUBRIC)[number]["id"];

export interface DesignScore {
  /** The mean of the criteria, 1–5, to two decimals. */
  score: number;
  scores: Partial<Record<DesignCriterion, number>>;
  /** The judge's one-line summary. */
  note?: string | undefined;
  usage: AiUsage;
}

export function rubricMessages(brief: string, look: PageLook): AiMessage[] {
  const text = [
    `The brief the page was built from: ${brief}`,
    `Screenshots: ${look.images.map((i) => `${i.width} px`).join(", ")} (top of the page first).`,
    ...checkLines(look.failed),
    "Score each criterion from 1 (poor) to 5 (excellent):",
    ...DESIGN_RUBRIC.map((c) => `- ${c.id}: ${c.question}`),
    `Answer with one JSON object and nothing else: {${DESIGN_RUBRIC.map((c) => `"${c.id}": n`).join(", ")}, "note": "one sentence"}`,
  ].join("\n");
  const parts: AiContentPart[] = [{ type: "text", text }];
  for (const i of look.images) parts.push({ type: "image_url", image_url: { url: i.url } });
  return [
    {
      role: "system",
      content: `You are a strict senior web designer reviewing a page an AI built with a site's components. Judge only what the screenshots show. Use the whole scale: 3 is acceptable, 5 is work you would ship unchanged.\n${DESIGN_GUIDANCE}`,
    },
    { role: "user", content: parts },
  ];
}

/** The judge's answer as scores; undefined when it has none. */
export function parseRubric(
  text: string,
): Pick<DesignScore, "score" | "scores" | "note"> | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(lenientJson(text.slice(start, end + 1))) as Record<string, unknown>;
  } catch {
    return undefined;
  }
  const scores: Partial<Record<DesignCriterion, number>> = {};
  for (const { id } of DESIGN_RUBRIC) {
    const n = Number(raw[id]);
    if (Number.isFinite(n) && n >= 1 && n <= 5) scores[id] = n;
  }
  const values = Object.values(scores) as number[];
  if (values.length === 0) return undefined;
  return {
    score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    scores,
    ...(typeof raw.note === "string" ? { note: raw.note.slice(0, 300) } : {}),
  };
}

/** Scores a rendered page against the rubric with a vision model. */
export async function scoreDesign(input: {
  transport: AiTransport;
  model: string;
  brief: string;
  look: PageLook;
  signal?: AbortSignal | undefined;
}): Promise<DesignScore> {
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
  let text = "";
  for await (const e of input.transport.stream({
    model: input.model,
    messages: rubricMessages(input.brief, input.look),
    maxTokens: 400,
    signal: input.signal,
  })) {
    if (e.type === "text") text += e.text;
    else {
      usage.inputTokens += e.inputTokens;
      usage.outputTokens += e.outputTokens;
    }
  }
  const parsed = parseRubric(text);
  if (!parsed) throw new Error(`the judge gave no scores: ${text.slice(0, 160)}`);
  return { ...parsed, usage };
}
