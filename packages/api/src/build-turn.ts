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
import {
  type Catalog,
  catalogPrompt,
  type PatchIssue,
  type PatchOp,
  patchPage,
  SurfacePatchError,
} from "@cloudhal/core-ts/surfaces";
import type { BuildObserver } from "@cloudhal/mcp-server";
import { notifyBuild } from "@cloudhal/mcp-server";
import type { AiMessage, AiTransport, AiUsage } from "./ai/client.ts";

/** What Studio's chat shows while a turn runs, as NDJSON lines. */
export type BuildTurnEvent =
  | { type: "round"; round: number }
  | { type: "say"; text: string }
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

export function buildSystemPrompt(catalog: Catalog, page: Page, locale = "en"): string {
  return [
    "You are Cloudhal's page builder. You change ONE page draft for a person, by writing JSON Lines.",
    "Every line is exactly one JSON object and nothing else, one of:",
    '{"say":"<one short sentence to the person, in their language>"}',
    '{"ops":[<RFC 6902 JSON Patch operations on the page>]}',
    '{"done":true}',
    "",
    "How to work:",
    "- Start with one say line that tells the person what you will build.",
    "- Then build in small steps: one ops line adds a few components (one to five), so the person sees the page grow.",
    '- Add a new surface section with {"op":"add","path":"/sections/-","value":{…}}; later lines add components to it by index (/sections/<i>/components/-) and link them into a parent\'s children.',
    "- Section ids look like sec_ followed by 6 to 32 letters or digits; component ids are lower-case words with hyphens.",
    '- Finish with {"done":true}. Never wrap lines in code fences. Never write HTML, CSS or scripts.',
    "- If you are told some operations were refused, send corrected lines for those parts only, then done.",
    "",
    `The page now (JSON): ${pageForModel(page)}`,
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

type Line = { say: string } | { ops: PatchOp[] } | { done: true } | { invalid: string };

/**
 * A model's answer split into JSON objects as they complete, wherever its line breaks fall: an
 * object may be pretty-printed over several lines, several may share a line, and code fences or
 * prose between them are set aside instead of being refused one line at a time.
 */
export class JsonObjectReader {
  #depth = 0;
  #inString = false;
  #escape = false;
  #current = "";
  #outside = "";

  /** Feeds text; returns the objects (as text) and the prose lines it completed. */
  push(text: string): Array<{ object: string } | { prose: string }> {
    const out: Array<{ object: string } | { prose: string }> = [];
    for (const ch of text) {
      if (this.#depth === 0) {
        if (ch === "{") {
          this.#flushOutside(out);
          this.#depth = 1;
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
      else if (ch === "{") this.#depth++;
      else if (ch === "}" && --this.#depth === 0) {
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
    this.#depth = 0;
    this.#inString = false;
    return out;
  }

  #flushOutside(out: Array<{ object: string } | { prose: string }>): void {
    const text = this.#outside.trim();
    this.#outside = "";
    if (text && !text.startsWith("```")) out.push({ prose: text.slice(0, 200) });
  }
}

export function parseLine(line: string): Line | undefined {
  const text = line.trim();
  if (!text || text.startsWith("```")) return undefined;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { invalid: `not one JSON object: ${text.slice(0, 80)}` };
  }
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return { invalid: "each line must be one JSON object" };
  const v = value as Record<string, unknown>;
  if (typeof v.say === "string") return { say: v.say.slice(0, 500) };
  if (Array.isArray(v.ops)) return { ops: v.ops as PatchOp[] };
  // Common slips, read as meant: one operation instead of a list, or a bare operation.
  if (v.ops && typeof v.ops === "object") return { ops: [v.ops as PatchOp] };
  if (typeof v.op === "string" && typeof v.path === "string")
    return { ops: [v as unknown as PatchOp] };
  if (v.done === true) return { done: true };
  return { invalid: 'a line has "say", "ops" or "done"' };
}

const issueText = (i: Pick<PatchIssue, "path" | "message">) => `${i.path || "/"} ${i.message}`;

/** Runs one turn; never throws for model or validation problems (they become events). */
export async function runBuildTurn(brief: string, deps: BuildTurnDeps): Promise<void> {
  const maxRounds = deps.maxRounds ?? 3;
  const usage: AiUsage = { inputTokens: 0, outputTokens: 0 };
  let page = await deps.load();
  let steps = 0;
  let refusedTotal = 0;
  const messages: AiMessage[] = [
    { role: "system", content: buildSystemPrompt(deps.catalog, page, deps.locale) },
    { role: "user", content: scopedBrief(brief, page, deps.scope) },
  ];

  const applyStep = async (ops: PatchOp[]): Promise<string[]> => {
    try {
      const patched = patchPage(page, ops, deps.catalog);
      page = await deps.write(patched.value);
      steps++;
      deps.emit({ type: "step", ok: true, rev: page.rev, ops: ops.length, repairs: patched.notes });
      await notifyBuild(() =>
        deps.build?.pageChanged({
          siteId: deps.siteId,
          page,
          tool: TOOL,
          actor: deps.actor,
          ops,
          repairs: patched.notes,
        }),
      );
      return [];
    } catch (e) {
      const issues =
        e instanceof SurfacePatchError
          ? e.issues.map(issueText)
          : [e instanceof Error ? e.message : String(e)];
      deps.emit({ type: "step", ok: false, issues });
      await notifyBuild(() =>
        deps.build?.patchRejected({
          siteId: deps.siteId,
          pageId: deps.pageId,
          tool: TOOL,
          actor: deps.actor,
          issues:
            e instanceof SurfacePatchError ? e.issues : [{ path: "/", message: issues[0] ?? "" }],
        }),
      );
      // A stale write means someone else saved: read the page again for the next step.
      if (!(e instanceof SurfacePatchError)) page = await deps.load().catch(() => page);
      return issues;
    }
  };

  try {
    for (let round = 1; round <= maxRounds; round++) {
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
        } else refused.push(...(await applyStep(parsed.ops)));
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
      refusedTotal += refused.length;
      if (refused.length === 0 || round === maxRounds) break;
      messages.push(
        { role: "assistant", content: output },
        {
          role: "user",
          content: [
            "These lines were refused; nothing else was lost:",
            ...refused.map((r) => `- ${r}`),
            `The page is now (JSON): ${pageForModel(page)}`,
            'Send corrected JSON Lines for those parts only, then {"done":true}.',
          ].join("\n"),
        },
      );
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
