/** Patching a page draft (`patch_draft`): JSON Patch, repairs and checks in one step. */
import type { Page } from "@cloudhal/core-contracts";
import type { Catalog } from "../catalog/index.ts";
import { checkPageSurfaces, checkSurface } from "../checks/index.ts";
import { repairValue } from "../repair.ts";
import { isObj } from "../shared.ts";
import { applyPatch, PatchError, type PatchOp } from "./json-patch.ts";

// ── patching a page draft ────────────────────────────────────────────────────────────────────

/** What a build may change on a page: its title, sections and SEO (RFC-0020 §6). */
export const PAGE_PATHS = /^\/(?:title|sections|seo)(?:\/|$)/;

export interface PatchResult<T> {
  value: T;
  /** Repairs made to what the operations carried. */
  notes: string[];
}

export interface PatchIssue {
  code: "VALIDATION_FAILED";
  /** JSON Pointer into the page. */
  path: string;
  message: string;
  /** The operation it came from, when known. */
  op?: number;
}

export class SurfacePatchError extends Error {
  override readonly name = "SurfacePatchError";
  readonly issues: readonly PatchIssue[];
  constructor(issues: readonly PatchIssue[]) {
    super(issues.map((i) => `${i.path || "/"}: ${i.message}`).join("; "));
    this.issues = issues;
  }
}

/**
 * The build pipeline for a page (RFC-0020 §6, steps 2–4): repair what the operations carry, apply
 * them, then check every surface on the result. Throws `SurfacePatchError` with A2UI-style
 * `VALIDATION_FAILED` issues; the caller writes the result through the store (policy, contract,
 * CAS).
 */
export function patchPage(
  page: Page,
  ops: readonly PatchOp[],
  catalog: Catalog,
): PatchResult<Page> {
  const notes: string[] = [];
  const repaired = ops.map((o, i) => {
    if (!isObj(o) || typeof o.path !== "string" || !PAGE_PATHS.test(o.path))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: typeof o?.path === "string" ? o.path : "",
          message: "a build may change /title, /sections and /seo only",
          op: i,
        },
      ]);
    if (typeof o.from === "string" && !PAGE_PATHS.test(o.from))
      throw new SurfacePatchError([
        {
          code: "VALIDATION_FAILED",
          path: o.from,
          message: "from must be under /title, /sections or /seo",
          op: i,
        },
      ]);
    if (!("value" in o)) return o;
    const r = repairValue(o.value, catalog);
    notes.push(...r.notes);
    return { ...o, value: r.value };
  });
  let value: Page | undefined;
  // An add into a children list past its end (models count ahead) becomes an append.
  for (let tries = 0; value === undefined; tries++) {
    try {
      value = applyPatch(page, repaired);
    } catch (e) {
      if (!(e instanceof PatchError)) throw e;
      const op = repaired[e.index];
      const appended = op?.path.replace(/\/children\/\d+$/, "/children/-");
      if (
        e.message.endsWith(": index out of range") &&
        op?.op === "add" &&
        appended !== op.path &&
        tries < repaired.length
      ) {
        notes.push(`${op.path} is past the end of its children; appended`);
        repaired[e.index] = { ...op, path: appended as string };
        continue;
      }
      throw new SurfacePatchError([
        { code: "VALIDATION_FAILED", path: e.path, message: e.message, op: e.index },
      ]);
    }
  }
  // A build changes the page's parts, never its shape: it keeps a title and a list of sections.
  if (!Array.isArray(value.sections) || typeof value.title !== "string")
    throw new SurfacePatchError([
      {
        code: "VALIDATION_FAILED",
        path: Array.isArray(value.sections) ? "/title" : "/sections",
        message: "the page keeps its title and its list of sections; change what is inside them",
        op: 0,
      },
    ]);
  const issues = checkPageSurfaces(value.sections ?? [], catalog).map(
    (i): PatchIssue => ({ code: "VALIDATION_FAILED", path: i.path, message: i.message }),
  );
  // Surfaces a build writes may not use components the catalog lacks: the store keeps those
  // (they may come from another theme), but a model writing them now has made a mistake.
  value.sections?.forEach((s, i) => {
    if (s.kind !== "surface") return;
    for (const id of checkSurface(s, catalog).unknown) {
      const j = s.components.findIndex((c) => c.id === id);
      issues.push({
        code: "VALIDATION_FAILED",
        path: `/sections/${i}/components/${j}/component`,
        message: `"${s.components[j]?.component}" is not in the catalog (${catalog.id})`,
      });
    }
  });
  if (issues.length) throw new SurfacePatchError(issues);
  return { value, notes };
}
