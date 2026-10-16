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

/**
 * What the judge scores, 1 (poor) to 5 (excellent), with what a 1, a 3 and a 5 look like: without
 * anchors a judge gives every complete page about the same score (RFC-0021 21c calibration).
 */
export const DESIGN_RUBRIC = [
  {
    id: "fidelity",
    question: "Does the page do what the brief asked?",
    anchors: [
      "the brief's main parts are missing",
      "most of the brief, with a notable part missing or wrong",
      "every part of the brief, with specific, believable content",
    ],
  },
  {
    id: "hierarchy",
    question: "Is it clear what matters most?",
    anchors: [
      "everything has the same weight, or there is no main heading",
      "a main heading, but sections and buttons compete for attention",
      "one obvious main heading, clear section headings, one primary action per section",
    ],
  },
  {
    id: "rhythm",
    question: "Do the sections vary and lead the eye down the page?",
    anchors: [
      "one undifferentiated block, or nothing",
      "separate sections, but they look alike (same tone, width and layout)",
      "sections alternate tone, width and layout (a full-width hero, grids, a contrasting band)",
    ],
  },
  {
    id: "color",
    question:
      "Is the palette coherent, with one dominant color and accents used with purpose? (RFC-0023)",
    anchors: [
      "clashing or random colors, or no color decisions at all (default greys and blue links)",
      "a workable palette, but accents are scattered or the page is flat",
      "one dominant color, accents only where they guide the eye, every surface readable",
    ],
  },
  {
    id: "spacing",
    question: "Is the spacing deliberate?",
    anchors: [
      "cramped, overlapping or with large accidental gaps",
      "acceptable but uniform or uneven, like a plain document",
      "consistent and generous, grouping related things and separating sections",
    ],
  },
  {
    id: "readability",
    question: "Is all text easy to read at both widths?",
    anchors: [
      "hard to read: low contrast, tiny or overlong lines",
      "readable with some strain somewhere",
      "effortless everywhere",
    ],
  },
  {
    id: "mobile",
    question: "Does the phone layout work?",
    anchors: [
      "broken: content cut off, overflowing or too small",
      "works, but stacks awkwardly or wastes the screen",
      "feels designed for the phone",
    ],
  },
] as const;

export type DesignCriterion = (typeof DESIGN_RUBRIC)[number]["id"];

export interface DesignScore {
  /** The mean of the criteria, 1–5, to two decimals. */
  score: number;
  scores: Partial<Record<DesignCriterion, number>>;
  /** What the judge saw wrong, before scoring (at most five). */
  problems?: string[] | undefined;
  /** The judge's one-line summary. */
  note?: string | undefined;
  usage: AiUsage;
}

export function rubricMessages(brief: string, look: PageLook): AiMessage[] {
  const text = [
    `The brief the page was built from: ${brief}`,
    `Screenshots: ${look.images.map((i) => `${i.width} px`).join(", ")} (top of the page first).`,
    ...checkLines(look.failed),
    "First list the most important design problems you see (at most five, concrete: which part, what is wrong). Then score each criterion from 1 to 5 against its anchors (2 and 4 are between them):",
    ...DESIGN_RUBRIC.map(
      (c) =>
        `- ${c.id}: ${c.question} 1 = ${c.anchors[0]}; 3 = ${c.anchors[1]}; 5 = ${c.anchors[2]}.`,
    ),
    `Answer with one JSON object and nothing else: {"problems": ["…"], ${DESIGN_RUBRIC.map((c) => `"${c.id}": n`).join(", ")}, "note": "one sentence"}`,
  ].join("\n");
  const parts: AiContentPart[] = [{ type: "text", text }];
  for (const i of look.images) parts.push({ type: "image_url", image_url: { url: i.url } });
  return [
    {
      role: "system",
      content: [
        "You are a strict senior web designer reviewing a page an AI built from a site's components. Judge only what the screenshots show.",
        "A page that shows no content is a 1 on every criterion: there is nothing to read, space or stack.",
        "Use the whole scale. Most AI-built pages deserve 2 or 3 on most criteria. Give 4 only to work you would ship after small changes, and 5 only to work a senior designer would be proud of. A page that is a plain column of headings and paragraphs is a 2 on rhythm and spacing, however complete it is.",
        DESIGN_GUIDANCE,
      ].join("\n"),
    },
    { role: "user", content: parts },
  ];
}

/** The judge's answer as scores; undefined when it has none. */
export function parseRubric(
  text: string,
): Pick<DesignScore, "score" | "scores" | "problems" | "note"> | undefined {
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
  const problems = Array.isArray(raw.problems)
    ? raw.problems
        .filter((p): p is string => typeof p === "string" && p.trim() !== "")
        .slice(0, 5)
        .map((p) => p.slice(0, 200))
    : [];
  return {
    score: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100,
    scores,
    ...(problems.length ? { problems } : {}),
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
    maxTokens: 700,
    // The same page should get the same score.
    temperature: 0,
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
