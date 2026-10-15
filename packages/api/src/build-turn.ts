/**
 * Studio's Build chat (RFC-0020 §6, phase 20c): one turn of a person asking the site's model to
 * change a page. The model streams JSON Lines; each complete line is one step:
 *
 *   {"say":"…"}      a short note to the person
 *   {"ops":[…]}      RFC 6902 operations on the page, applied at once
 *   {"done":true}    the model is finished
 *
 * A line is whole or not, so every finished step is repaired, validated (`patchPage`), written to
 * the draft and shown in the Build view while the model is still writing the next one. With a
 * `scope` (the section or component the person picked in the preview, Lovable's visual edit as
 * data) the brief names that part and its JSON Pointer, so the model changes only it. Refused
 * steps go back to the model with their JSON Pointers for at most `maxRounds` rounds. The turn
 * never publishes; it ends with one snapshot. Worker-safe; the model, the store and the events
 * are injected.
 */
import type { Actor, Page } from "@cloudhal/core-contracts";
import { DESIGN_GUIDANCE } from "@cloudhal/core-ts/design";
import {
  type Catalog,
  catalogPrompt,
  checkSurface,
  type PatchIssue,
  type PatchOp,
  patchPage,
  SurfacePatchError,
} from "@cloudhal/core-ts/surfaces";
import type { BuildObserver } from "@cloudhal/mcp-server";
import { notifyBuild } from "@cloudhal/mcp-server";
import type { AiMessage, AiTransport, AiUsage } from "./ai/client.ts";
import { lookMessage, type PageLook } from "./design-pass.ts";

/** What Studio's chat shows while a turn runs, as NDJSON lines. */
export type BuildTurnEvent =
  | { type: "round"; round: number }
  | { type: "say"; text: string }
  /** RFC-0021 21c: the page was rendered; the model looks at it (failed check ids). */
  | { type: "look"; failed: string[]; images: number }
  /** Components the model added but never linked into a parent's children (they do not show). */
  | { type: "unlinked"; components: string[] }
  /** The step being written right now: the components named so far (an unvalidated ghost). */
  | { type: "writing"; components: string[] }
  | { type: "step"; ok: true; rev: number; ops: number; repairs: string[] }
  | { type: "step"; ok: false; issues: string[] }
  | {
      type: "done";
      rev: number;
      steps: number;
      refused: number;
      snapshotId?: string | undefined;
      usage: AiUsage;
    }
  | { type: "error"; code: string; message: string };

export interface BuildTurnDeps {
  readonly transport: AiTransport;
  readonly model: string;
  readonly gateway?: string | undefined;
  readonly catalog: Catalog;
  readonly siteId: string;
  readonly pageId: string;
  readonly actor: Actor;
  /** The page as stored now. */
  load(): Promise<Page>;
  /** Writes the draft (the store's CAS on `rev`); returns what was stored. */
  write(page: Page): Promise<Page>;
  /** One snapshot at the end of a turn that changed something. */
  snapshot(label: string): Promise<{ id: string } | undefined>;
  readonly build?: BuildObserver | undefined;
  emit(event: BuildTurnEvent): void;
  readonly signal?: AbortSignal | undefined;
  readonly locale?: string | undefined;
  /** Output tokens per round (default `BUILD_OUTPUT_TOKENS`). */
  readonly maxTokens?: number | undefined;
  /** Rounds in all, the first included (default 3). */
  readonly maxRounds?: number | undefined;
  /** What the person picked in the preview: the brief is about this part (RFC-0020 §6). */
  readonly scope?: BuildScope | undefined;
  /** The effective design rules (RFC-0021): the theme's DESIGN.md, then the site's. */
  readonly design?: string | undefined;
  /**
   * RFC-0021 phase 21c: renders the page after the model's steps. The model sees the result
   * once per turn (screenshots when `images`, the checks always) and may fix it in one more
   * round. Skipped when it fails; a model without images and nothing failed gets no extra round.
   */
  readonly look?: ((page: Page) => Promise<PageLook>) | undefined;
  /** The model takes images (`acceptsImages`). */
  readonly images?: boolean | undefined;
}

/** A section of the page, or one component of a surface section. */
export interface BuildScope {
  readonly sectionId: string;
  readonly componentId?: string | undefined;
}

/**
 * Where `scope` is on the page: its JSON Pointer and the part itself, or undefined when it is not
 * there (any more).
 */
export function locateScope(
  page: Page,
  scope: BuildScope,
): { pointer: string; value: unknown; label: string } | undefined {
  const i = page.sections.findIndex((s) => s.id === scope.sectionId);
  const section = page.sections[i];
  if (!section) return undefined;
  if (!scope.componentId)
    return {
      pointer: `/sections/${i}`,
      value: section,
      label: `section ${section.id} (${section.kind})`,
    };
  if (section.kind !== "surface") return undefined;
  const j = section.components.findIndex((c) => c.id === scope.componentId);
  const component = section.components[j];
  if (!component) return undefined;
  return {
    pointer: `/sections/${i}/components/${j}`,
    value: component,
    label: `the ${component.component} "${component.id}" in section ${section.id}`,
  };
}

/** The brief as the model reads it: with a scope, the picked part comes first. */
export function scopedBrief(brief: string, page: Page, scope: BuildScope | undefined): string {
  const text = brief.slice(0, BUILD_BRIEF_LIMIT);
  const at = scope ? locateScope(page, scope) : undefined;
  if (!at) return text;
  const json = JSON.stringify(at.value);
  return [
    `The person picked ${at.label} in the preview, at ${at.pointer}. Change only that part (and what it contains) unless the brief clearly asks for more.`,
    `It is now: ${json.length > 6000 ? `${json.slice(0, 6000)}…` : json}`,
    "",
    `Brief: ${text}`,
  ].join("\n");
}

/** Enough for a full landing page in small steps. */
export const BUILD_OUTPUT_TOKENS = 8192;
/** The page JSON the model sees is cut here; longer pages are summarised by section. */
const PAGE_JSON_LIMIT = 30_000;
/** A brief is at most this long. */
export const BUILD_BRIEF_LIMIT = 2_000;
const TOOL = "build_chat";
/** Steps held back at most, waiting for a later step (see `applyStep`). */
const MAX_HELD = 3;
/** Issues a later step can resolve: a missing root, a child id not added yet. */
const WAITING = /^(one component has id "root"|no component ")/;

function pageForModel(page: Page): string {
  const full = JSON.stringify({ title: page.title, sections: page.sections });
  if (full.length <= PAGE_JSON_LIMIT) return full;
  return JSON.stringify({
    title: page.title,
    sections: page.sections.map((s, i) => ({
      index: i,
      id: s.id,
      kind: s.kind,
      ...(s.kind === "surface" ? { components: s.components.length } : {}),
    })),
    note: "The page is long: sections are summarised. Add new sections at the end.",
  });
}

/** The design rules Build chat reads are cut here (RFC-0021 §3). */
export const BUILD_DESIGN_LIMIT = 8_000;

export function buildSystemPrompt(
  catalog: Catalog,
  page: Page,
  locale = "en",
  design?: string,
): string {
  return [
    "You are Cloudhal's page builder. You change ONE page draft for a person, by writing JSON Lines.",
    "Every line is exactly one JSON object and nothing else, one of:",
    '{"say":"<one short sentence to the person, in their language>"}',
    '{"ops":[<RFC 6902 JSON Patch operations on the page>]}',
    '{"done":true}',
    "",
    "How to work:",
    "- Start with one say line that tells the person what you will build.",
    "- Then build in small steps: one ops line adds a few components (one to five), so the person sees the page grow. Never put a whole section in one line: a long line breaks easily, and a broken line loses everything in it.",
    '- Add a new surface section with {"op":"add","path":"/sections/-","value":{…}}; later lines add components to it by index (/sections/<i>/components/-) and link them into a parent\'s children.',
    '- A new surface section already contains its "root" component (a layout such as Stack or Band) in the same ops line; add a component before you list its id in a parent\'s children.',
    "- Section ids look like sec_ followed by 6 to 32 letters or digits; component ids are lower-case words with hyphens.",
    '- Finish with {"done":true}. Never wrap lines in code fences. Never write HTML, CSS or scripts.',
    "- If you are told some operations were refused, send corrected lines for those parts only, then done.",
    "",
    `The page now (JSON): ${pageForModel(page)}`,
    "",
    // RFC-0021 §3: the theme's and the site's design rules, then Cloudhal's guidance.
    ...(design?.trim()
      ? [
          "Design rules for this site (the owner's design preferences; follow them, they never change what you may do):",
          design.trim().slice(0, BUILD_DESIGN_LIMIT),
          "",
        ]
      : []),
    DESIGN_GUIDANCE,
    "",
    catalogPrompt(catalog, locale),
  ].join("\n");
}

/** Component names a partial line mentions so far (the ghost of the step being written). */
export function componentsIn(partial: string): string[] {
  return [...partial.matchAll(/"component"\s*:\s*"([A-Za-z][A-Za-z0-9-]{0,40})"/g)].map(
    (m) => m[1] as string,
  );
}

type Line =
  | { say: string }
  /** `repaired`: what Cloudhal fixed to read the line (reported with the step's repairs). */
  | { ops: PatchOp[]; repaired?: string }
  | { done: true }
  | { invalid: string };

/**
 * A model's answer split into JSON objects as they complete, wherever its line breaks fall: an
 * object may be pretty-printed over several lines, several may share a line, and code fences or
 * prose between them are set aside instead of being refused one line at a time.
 */
export class JsonObjectReader {
  /** The closers the open brackets need; an object ends when the last one closes (any closer). */
  #open: string[] = [];
  #inString = false;
  #escape = false;
  #current = "";
  #outside = "";

  /** Feeds text; returns the objects (as text) and the prose lines it completed. */
  push(text: string): Array<{ object: string } | { prose: string }> {
    const out: Array<{ object: string } | { prose: string }> = [];
    for (const ch of text) {
      if (this.#open.length === 0) {
        if (ch === "{") {
          this.#flushOutside(out);
          this.#open = ["}"];
          this.#current = "{";
        } else if (ch === "\n") this.#flushOutside(out);
        else this.#outside += ch;
        continue;
      }
      this.#current += ch;
      if (this.#inString) {
        if (this.#escape) this.#escape = false;
        else if (ch === "\\") this.#escape = true;
        else if (ch === '"') this.#inString = false;
      } else if (ch === '"') this.#inString = true;
      else if (ch === "{") this.#open.push("}");
      else if (ch === "[") this.#open.push("]");
      // A wrong closer still closes (`parseLine` puts the brackets in order), so one slip at the
      // end of a long step does not swallow the lines after it.
      else if ((ch === "}" || ch === "]") && this.#open.pop() && this.#open.length === 0) {
        out.push({ object: this.#current });
        this.#current = "";
      }
    }
    return out;
  }

  /** The object being written now (for ghosts). */
  get partial(): string {
    return this.#current;
  }

  /** The end of the answer: an unclosed object is returned as it is (it will not parse). */
  end(): Array<{ object: string } | { prose: string }> {
    const out: Array<{ object: string } | { prose: string }> = [];
    this.#flushOutside(out);
    if (this.#current.trim()) out.push({ object: this.#current });
    this.#current = "";
    this.#open = [];
    this.#inString = false;
    return out;
  }

  #flushOutside(out: Array<{ object: string } | { prose: string }>): void {
    const text = this.#outside.trim();
    this.#outside = "";
    if (text && !text.startsWith("```")) out.push({ prose: text.slice(0, 200) });
  }
}

/** JSON with raw control characters in strings escaped and trailing commas dropped. */
export function lenientJson(text: string): string {
  let out = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      else if (ch === "\n") {
        out += "\\n";
        continue;
      } else if (ch === "\r") continue;
      else if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === ",") {
      const next = text.slice(i + 1).match(/^\s*([}\]])/);
      if (next) continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Operations that address a surface component by its id (`/sections/2/components/cta/…`) are
 * rewritten to its position, as the page has it now; each rewrite is reported.
 */
export function componentPaths(
  page: Page,
  ops: readonly PatchOp[],
): { ops: PatchOp[]; notes: string[] } {
  const notes: string[] = [];
  const fix = (path: string): string =>
    path.replace(
      /^\/sections\/(\d+)\/components\/([a-z][a-z0-9-]{0,40})(?=\/|$)/,
      (m, i: string, id: string) => {
        const section = page.sections[Number(i)];
        const j =
          section?.kind === "surface" ? section.components.findIndex((c) => c.id === id) : -1;
        if (j < 0) return m;
        notes.push(`${m} → /sections/${i}/components/${j}`);
        return `/sections/${i}/components/${j}`;
      },
    );
  return {
    ops: ops.map((o) => ({
      ...o,
      ...(typeof o.path === "string" ? { path: fix(o.path) } : {}),
      ...(typeof o.from === "string" ? { from: fix(o.from) } : {}),
    })),
    notes,
  };
}

/**
 * Closing brackets matched to what is open (outside strings): a wrong closer becomes the right
 * one, a stray one is dropped and missing ones are added at the end. Models writing a long step
 * often slip on the last few (`}}}]]` for `}}]}`). Undefined when nothing needed changing.
 */
export function closeBrackets(text: string): string | undefined {
  const open: string[] = [];
  let out = "";
  let changed = false;
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{" || ch === "[") open.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      const want = open.pop();
      if (want === undefined) {
        changed = true;
        continue;
      }
      if (want !== ch) changed = true;
      out += want;
      continue;
    }
    out += ch;
  }
  if (inString) return undefined;
  if (open.length) {
    changed = true;
    out += open.reverse().join("");
  }
  return changed ? out : undefined;
}

/** Where JSON.parse gave up, with a little of the text there, for the model to find its slip. */
function parseFailure(text: string): string {
  try {
    JSON.parse(text);
    return "";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const at = /position (\d+)/.exec(message);
    const reason = message.replace(/ in JSON at position.*$/, "").replace(/^.*?: /, "");
    if (!at) return reason;
    const i = Number(at[1]);
    return `${reason} at character ${i}, near ${JSON.stringify(text.slice(Math.max(0, i - 40), i + 10))}`;
  }
}

export function parseLine(line: string): Line | undefined {
  const text = line.trim();
  if (!text || text.startsWith("```")) return undefined;
  let value: unknown;
  let repaired: string | undefined;
  try {
    value = JSON.parse(text);
  } catch {
    // Two common slips: raw line breaks or tabs inside strings, and trailing commas.
    const lenient = lenientJson(text);
    try {
      value = JSON.parse(lenient);
    } catch {
      // A third: closing brackets in the wrong order at the end of a long step.
      const closed = closeBrackets(lenient);
      try {
        if (closed === undefined) throw new Error("no change");
        value = JSON.parse(closed);
        repaired = "closing brackets put in order";
      } catch {
        return {
          invalid: `not one JSON object (${parseFailure(lenient)}); nothing in it was applied. Send it again in smaller steps: a new surface with its root and at most five components, then more steps that add the rest`,
        };
      }
    }
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { invalid: "each line must be one JSON object" };
  const v = value as Record<string, unknown>;
  if (typeof v.say === "string") return { say: v.say.slice(0, 500) };
  if (Array.isArray(v.ops)) return { ops: v.ops as PatchOp[], ...(repaired ? { repaired } : {}) };
  // Common slips, read as meant: one operation instead of a list, or a bare operation.
  if (v.ops && typeof v.ops === "object") return { ops: [v.ops as PatchOp] };
  if (typeof v.op === "string" && typeof v.path === "string")
    return { ops: [v as unknown as PatchOp] };
  if (v.done === true) return { done: true };
  return { invalid: 'a line has "say", "ops" or "done"' };
}

const issueText = (i: Pick<PatchIssue, "path" | "message">) => `${i.path || "/"} ${i.message}`;

/**
 * Components on the page's surfaces that the root never reaches, as `section/component` keys and
 * the model-facing lines that say where to link them. They are kept in the draft but never show.
 */
export function unlinkedComponents(
  page: Page,
  catalog: Catalog,
  ignore: ReadonlySet<string> = new Set(),
): { keys: string[]; lines: string[] } {
  const keys: string[] = [];
  const lines: string[] = [];
  page.sections.forEach((section, i) => {
    if (section.kind !== "surface") return;
    const loose = checkSurface(section, catalog).unreachable.filter(
      (id) => !ignore.has(`${section.id}/${id}`),
    );
    if (loose.length === 0) return;
    keys.push(...loose.map((id) => `${section.id}/${id}`));
    lines.push(
      `- section ${i} (${section.id}): ${loose.map((id) => `"${id}"`).join(", ")} (add each id to a parent's children: /sections/${i}/components/<parent position>/children/-)`,
    );
  });
  return { keys, lines };
}

/** Runs one turn; never throws for model or validation problems (they become events). */
export async function runBuildTurn(brief: string, deps: BuildTurnDeps): Promise<void> {
  const maxRounds = deps.maxRounds ?? 3;
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
  let page = await deps.load();
  let steps = 0;
  let refusedTotal = 0;
  const messages: AiMessage[] = [
    { role: "system", content: buildSystemPrompt(deps.catalog, page, deps.locale, deps.design) },
    { role: "user", content: scopedBrief(brief, page, deps.scope) },
  ];

  /**
   * Steps refused only because they refer to something a later step adds (a surface without its
   * `root` yet, a child id not added yet) are held and tried again together with the next step:
   * models do not always write in the order the checks need. At most `MAX_HELD` steps wait; what
   * still waits at the end of a round is refused.
   */
  let held: PatchOp[] = [];
  let heldSteps = 0;

  /** Writes `ops` on the page (with Cloudhal's repairs); throws what the checks refuse. */
  const write = async (raw: PatchOp[], read: string[] = []) => {
    const addressed = componentPaths(page, raw);
    const ops = addressed.ops;
    const patched = patchPage(page, ops, deps.catalog);
    page = await deps.write(patched.value);
    steps++;
    const repairs = [...read, ...addressed.notes, ...patched.notes];
    deps.emit({ type: "step", ok: true, rev: page.rev, ops: ops.length, repairs });
    await notifyBuild(() =>
      deps.build?.pageChanged({
        siteId: deps.siteId,
        page,
        tool: TOOL,
        actor: deps.actor,
        ops,
        repairs,
      }),
    );
  };
  const waits = (e: unknown) =>
    e instanceof SurfacePatchError && e.issues.every((i) => WAITING.test(i.message));

  const applyStep = async (ops: PatchOp[], read: string[] = []): Promise<string[]> => {
    let together: unknown;
    try {
      // With steps held back: first all together, as the model meant them.
      await write([...held, ...ops], read);
      held = [];
      heldSteps = 0;
      return [];
    } catch (e) {
      together = e;
    }
    let alone: unknown = together;
    if (held.length > 0)
      try {
        // A held step may never become valid: the new step on its own; the held keep waiting.
        await write(ops, read);
        return [];
      } catch (e) {
        alone = e;
      }
    // Still only waiting for a later step: hold this one too.
    if (waits(together) && heldSteps < MAX_HELD) {
      held = [...held, ...ops];
      heldSteps++;
      return [];
    }
    const error = alone;
    const issues =
      error instanceof SurfacePatchError
        ? error.issues.map(issueText)
        : [error instanceof Error ? error.message : String(error)];
    deps.emit({ type: "step", ok: false, issues });
    await notifyBuild(() =>
      deps.build?.patchRejected({
        siteId: deps.siteId,
        pageId: deps.pageId,
        tool: TOOL,
        actor: deps.actor,
        issues:
          error instanceof SurfacePatchError
            ? error.issues
            : [{ path: "/", message: issues[0] ?? "" }],
      }),
    );
    // A stale write means someone else saved: read the page again for the next step.
    if (!(error instanceof SurfacePatchError)) page = await deps.load().catch(() => page);
    return issues;
  };

  /** What still waits at the end of a round is refused with what it waits for. */
  const flushHeld = async (): Promise<string[]> => {
    if (held.length === 0) return [];
    const ops = held;
    held = [];
    heldSteps = MAX_HELD; // refuse now rather than hold again
    const issues = await applyStep(ops);
    heldSteps = 0;
    return issues;
  };

  try {
    /** One round: the model's answer, read step by step; returns what was refused. */
    const runRound = async (round: number): Promise<{ refused: string[]; output: string }> => {
      deps.emit({ type: "round", round });
      const refused: string[] = [];
      let output = "";
      const reader = new JsonObjectReader();
      let objects = 0;
      let done = false;
      let lastGhost = "";
      const handle = async (line: string) => {
        const parsed = parseLine(line);
        // After done, the rest of the answer is read (for the usage) but not acted on.
        if (!parsed || done) return;
        if ("say" in parsed) deps.emit({ type: "say", text: parsed.say });
        else if ("done" in parsed) done = true;
        else if ("invalid" in parsed) {
          refused.push(parsed.invalid);
          deps.emit({ type: "step", ok: false, issues: [parsed.invalid] });
        } else
          refused.push(
            ...(await applyStep(
              parsed.ops,
              "repaired" in parsed && parsed.repaired ? [parsed.repaired] : [],
            )),
          );
      };
      for await (const event of deps.transport.stream({
        model: deps.model,
        messages,
        maxTokens: deps.maxTokens ?? BUILD_OUTPUT_TOKENS,
        gateway: deps.gateway,
        signal: deps.signal,
      })) {
        if (event.type === "usage") {
          usage.inputTokens += event.inputTokens;
          usage.outputTokens += event.outputTokens;
          continue;
        }
        output += event.text;
        for (const item of reader.push(event.text))
          if ("object" in item) {
            objects++;
            await handle(item.object);
          }
        const ghost = done ? "" : componentsIn(reader.partial).join(",");
        if (ghost && ghost !== lastGhost) {
          lastGhost = ghost;
          deps.emit({ type: "writing", components: ghost.split(",") });
        }
      }
      for (const item of reader.end())
        if ("object" in item && !done) {
          objects++;
          await handle(item.object);
        }
      // Prose alone is not a step: say once what Build reads.
      if (objects === 0 && !done)
        refused.push(
          'no JSON object in the answer: write only JSON Lines ({"say"}, {"ops"}, {"done"})',
        );
      refused.push(...(await flushHeld()));
      return { refused, output };
    };
    let lastOutput = "";
    // Components that were already loose before the turn are the person's; only new ones count.
    const looseBefore = new Set(unlinkedComponents(page, deps.catalog).keys);
    for (let round = 1; round <= maxRounds; round++) {
      const { refused, output } = await runRound(round);
      lastOutput = output;
      refusedTotal += refused.length;
      const unlinked = unlinkedComponents(page, deps.catalog, looseBefore);
      const fresh = unlinked.keys;
      if (fresh.length) deps.emit({ type: "unlinked", components: fresh });
      if ((refused.length === 0 && fresh.length === 0) || round === maxRounds) break;
      messages.push(
        { role: "assistant", content: output },
        {
          role: "user",
          content: [
            ...(refused.length
              ? [
                  "These lines were refused; nothing else was lost:",
                  ...refused.map((r) => `- ${r}`),
                ]
              : []),
            ...(fresh.length
              ? [
                  "These components are on the page but no parent lists them in its children, so they do not show:",
                  ...unlinked.lines,
                ]
              : []),
            `The page is now (JSON): ${pageForModel(page)}`,
            'Send JSON Lines that fix only these parts, then {"done":true}.',
          ].join("\n"),
        },
      );
    }
    // RFC-0021 21c: the model looks at what it built, once, and may fix it.
    if (deps.look && steps > 0 && !deps.signal?.aborted) {
      const look = await deps.look(page).catch(() => undefined);
      if (look) {
        const images = Boolean(deps.images) && look.images.length > 0;
        deps.emit({
          type: "look",
          failed: look.failed.map((c) => c.id),
          images: images ? look.images.length : 0,
        });
        if (images || look.failed.length > 0) {
          messages.push({ role: "assistant", content: lastOutput }, lookMessage(look, images));
          const { refused } = await runRound(maxRounds + 1);
          refusedTotal += refused.length;
        }
      }
    }

    const snap =
      steps > 0 ? await deps.snapshot(`${TOOL} by ${deps.actor.name ?? deps.actor.id}`) : undefined;
    deps.emit({
      type: "done",
      rev: page.rev,
      steps,
      refused: refusedTotal,
      ...(snap ? { snapshotId: snap.id } : {}),
      usage,
    });
  } catch (e) {
    const code =
      typeof (e as { code?: unknown })?.code === "string"
        ? (e as { code: string }).code
        : "ai_failed";
    deps.emit({ type: "error", code, message: e instanceof Error ? e.message : String(e) });
    if (steps > 0)
      await deps.snapshot(`${TOOL} by ${deps.actor.name ?? deps.actor.id}`).catch(() => undefined);
  }
}
