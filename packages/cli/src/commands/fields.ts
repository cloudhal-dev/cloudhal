/**
 * `cloudhal fields rename|retype|localize|remove|continue|revert` (RFC-0041 §6): field operations
 * on the local site, or with `--remote` on the deployment (deployment token). `--dry-run` prints
 * the report and writes nothing; it also greps the project's theme (`src/`) for code that reads
 * the field directly (`fields.<key>`), which a rename, type change or removal would break. A run
 * snapshots first, rewrites entries in guarded batches and loops until done; `revert <id>` undoes
 * it. Nothing goes live until a person publishes.
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FieldOption, SubFieldDefinition } from "@cloudhal/core-contracts";
import {
  continueFieldOperation,
  type FieldOperation,
  type FieldOperationResult,
  type FieldRevertResult,
  revertFieldOperation,
  runFieldOperation,
} from "@cloudhal/core-ts";
import { ALL_FIELD_TYPES, type FieldType } from "@cloudhal/core-ts/fields";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { humanizeSlug } from "@cloudhal/core-ts/names";
import type { CliCommand } from "../cli/types.ts";
import { remoteFlags } from "../cli/types.ts";
import { readProjectConfig } from "../config.ts";
import { brief, deployment } from "./sync.ts";

const CLI_ACTOR = { kind: "human", id: "user_localcli0001", name: "cloudhal CLI" } as const;

export const FIELDS_USAGE =
  "usage: cloudhal fields rename <collection> <from> <to> | retype <collection> <key> <type> [--options a,b] [--multiple] [--collections a,b] [--max-items n] [--sub-fields file.json] [--clear] | localize <collection> <key> on|off | remove <collection> <key> | continue|revert <collection> <id> [--clear]  [--sub <sub-field>] [--dry-run] [--remote]";

/** What `parseFieldsArgs` takes besides the positionals (`subFields` already read from its file). */
export interface FieldsFlags {
  dryRun?: boolean;
  options?: string;
  multiple?: boolean;
  clear?: boolean;
  /** RFC-0045 §7: a reference's target collections, `a,b`. */
  collections?: string;
  maxItems?: string;
  subFields?: SubFieldDefinition[];
  /** A repeater's sub-field: the operation renames, converts or removes it in every item. */
  sub?: string;
}

/** `--max-items 20` as a positive integer. */
function maxItemsOf(v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new Error("--max-items is a whole number from 1");
  return n;
}

/** The type change's RFC-0045 inputs, each only when given. */
function stage4Inputs(flags: FieldsFlags) {
  const list = flags.collections
    ?.split(",")
    .map((c) => c.trim())
    .filter(Boolean);
  return {
    ...(list?.length ? { collections: list } : {}),
    ...(flags.maxItems !== undefined ? { maxItems: maxItemsOf(flags.maxItems) } : {}),
    ...(flags.subFields ? { subFields: flags.subFields } : {}),
  };
}

export interface FieldsCliOptions {
  readonly projectDir: string;
  readonly remote?: boolean;
  readonly adminUrl?: string;
  readonly fetch?: typeof fetch;
}

type Request =
  | { kind: "run"; op: FieldOperation; dryRun: boolean }
  | { kind: "continue" | "revert"; collection: string; id: string; clear?: boolean };

export type FieldsCliResult =
  | { kind: "run"; result: FieldOperationResult; theme: string[] }
  | { kind: "revert"; result: FieldRevertResult };

/** `--options talk,workshop` (or `talk=Talk`) as select options labelled in `locale`. */
function optionsOf(list: string, locale: string): FieldOption[] {
  return list
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [value, label] = s.split("=", 2) as [string, string | undefined];
      return { value, labels: { [locale]: label?.trim() || humanizeSlug(value) } };
    });
}

/** The positionals and flags as a request (throws the usage when they do not fit). */
export function parseFieldsArgs(
  rest: readonly string[],
  flags: FieldsFlags,
  locale = "en",
): Request {
  const [action, collection, a, b] = rest;
  const need = (...xs: (string | undefined)[]) => {
    if (!collection || xs.some((x) => !x)) throw new Error(FIELDS_USAGE);
  };
  const dryRun = flags.dryRun === true;
  const c = collection as string;
  const sub = flags.sub ? { sub: flags.sub } : {};
  switch (action) {
    case "rename":
      need(a, b);
      return {
        kind: "run",
        dryRun,
        op: { op: "rename_field", collection: c, from: a as string, to: b as string, ...sub },
      };
    case "remove":
      need(a);
      return {
        kind: "run",
        dryRun,
        op: { op: "remove_field", collection: c, key: a as string, ...sub },
      };
    case "localize":
      need(a);
      if (b !== "on" && b !== "off") throw new Error(FIELDS_USAGE);
      return {
        kind: "run",
        dryRun,
        op: {
          op: "set_field_localized",
          collection: c,
          key: a as string,
          localized: b === "on",
          ...sub,
        },
      };
    case "retype": {
      need(a, b);
      // The store refuses reference and repeater targets without its capability (RFC-0045 §1).
      if (!ALL_FIELD_TYPES.includes(b as FieldType))
        throw new Error(`the type is one of ${ALL_FIELD_TYPES.join(", ")}`);
      const op: FieldOperation = {
        op: "change_field_type",
        collection: c,
        key: a as string,
        type: b as FieldType,
        ...sub,
        ...(flags.options ? { options: optionsOf(flags.options, locale) } : {}),
        ...(b === "select" && !flags.sub ? { multiple: flags.multiple === true } : {}),
        ...(b === "reference" && !flags.sub ? { multiple: flags.multiple === true } : {}),
        ...stage4Inputs(flags),
        ...(flags.clear ? { onInvalid: "clear" as const } : {}),
      };
      return { kind: "run", dryRun, op };
    }
    case "continue":
    case "revert":
      need(a);
      // RFC-0045 §7: `--clear` drops values that stopped converting while the operation ran.
      return {
        kind: action,
        collection: c,
        id: a as string,
        ...(flags.clear ? { clear: true } : {}),
      };
    default:
      throw new Error(FIELDS_USAGE);
  }
}

const SOURCE = /\.(astro|[cm]?[jt]sx?|mdx?)$/;

/** Theme files under `src/` that read `fields.<key>` directly (RFC-0041 §6 dry run, CLI only). */
export async function themeReferences(projectDir: string, key: string): Promise<string[]> {
  const pattern = new RegExp(
    `fields(?:\\?\\.|\\.)${key}\\b|fields\\[\\s*["'\`]${key}["'\`]\\s*\\]`,
  );
  const root = path.join(projectDir, "src");
  const out: string[] = [];
  let files: string[];
  try {
    files = (await readdir(root, { recursive: true })) as string[];
  } catch {
    return out;
  }
  for (const file of files.sort()) {
    if (!SOURCE.test(file)) continue;
    const text = await readFile(path.join(root, file), "utf8").catch(() => "");
    if (pattern.test(text)) out.push(path.join("src", file));
  }
  return out;
}

const keyOf = (op: FieldOperation) => (op.op === "rename_field" ? op.from : op.key);

/** Another call can make progress: nothing changed meanwhile, nothing stopped converting. */
const again = (r: { done: boolean; skipped: unknown[]; unconvertible?: unknown[] | undefined }) =>
  !r.done && r.skipped.length === 0 && (r.unconvertible ?? []).length === 0;

async function runLocal(options: FieldsCliOptions, req: Request): Promise<FieldsCliResult> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const clear = req.kind !== "run" && req.clear ? { onInvalid: "clear" as const } : {};
  const actor = { actor: CLI_ACTOR, ...clear };
  try {
    if (req.kind === "revert") {
      let result = await revertFieldOperation(local.store, cfg.siteId, req.id, actor);
      while (again(result))
        result = await revertFieldOperation(local.store, cfg.siteId, req.id, actor);
      return { kind: "revert", result };
    }
    let result =
      req.kind === "run"
        ? await runFieldOperation(local.store, cfg.siteId, req.op, { ...actor, dryRun: req.dryRun })
        : await continueFieldOperation(local.store, cfg.siteId, req.id, actor);
    while (!result.dryRun && again(result))
      result = await continueFieldOperation(local.store, cfg.siteId, result.operationId, actor);
    const theme =
      req.kind === "run" ? await themeReferences(options.projectDir, keyOf(req.op)) : [];
    return { kind: "run", result, theme };
  } finally {
    await local.close();
  }
}

async function runRemote(options: FieldsCliOptions, req: Request): Promise<FieldsCliResult> {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const collection = req.kind === "run" ? req.op.collection : req.collection;
  const base = `/api/admin/sites/${cfg.siteId}/collections/${collection}/fields/operations`;
  const call = async (where: string, body?: unknown) => {
    const res = await f(new URL(where, adminUrl), {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`the deployment answered ${res.status}: ${brief(text)}`);
    return JSON.parse(text) as FieldOperationResult & FieldRevertResult;
  };
  const clear = req.kind !== "run" && req.clear ? { onInvalid: "clear" } : {};
  if (req.kind === "revert") {
    let result = await call(`${base}/${req.id}/revert`, clear);
    while (again(result)) result = await call(`${base}/${req.id}/revert`, clear);
    return { kind: "revert", result };
  }
  const {
    op: _op,
    collection: _c,
    ...fields
  } = req.kind === "run" ? req.op : { op: "", collection: "" };
  let result =
    req.kind === "run"
      ? await call(base, { op: req.op.op, ...fields, dryRun: req.dryRun })
      : await call(`${base}?continue=${encodeURIComponent(req.id)}`, clear);
  while (!result.dryRun && again(result))
    result = await call(`${base}?continue=${encodeURIComponent(result.operationId)}`, clear);
  const theme = req.kind === "run" ? await themeReferences(options.projectDir, keyOf(req.op)) : [];
  return { kind: "run", result, theme };
}

/** Runs one `cloudhal fields` request locally or on the deployment. */
export async function fieldsCli(options: FieldsCliOptions, req: Request): Promise<FieldsCliResult> {
  return options.remote ? runRemote(options, req) : runLocal(options, req);
}

/** The site's default language for option labels (the local copy; `en` without one). */
async function localDefaultLocale(projectDir: string): Promise<string> {
  try {
    const cfg = await readProjectConfig(projectDir);
    const local = await openLocalStore(path.join(projectDir, cfg.dataDir));
    try {
      return (await local.store.getSite(cfg.siteId))?.defaultLocale ?? "en";
    } finally {
      await local.close();
    }
  } catch {
    return "en";
  }
}

const show = (v: unknown) => {
  const s = typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v ?? null);
  return s.length > 60 ? `${s.slice(0, 59)}…` : s;
};

/** Terminal lines for a result. */
export function describeFields(r: FieldsCliResult): string[] {
  if (r.kind === "revert") {
    const x = r.result;
    return [
      `${x.done ? "reverted" : "reverting"} ${x.operationId}: ${x.restored} entries restored`,
      ...(x.edited.length ? [`converted back (edited since): ${x.edited.join(", ")}`] : []),
      ...(x.dropped ?? []).map(
        (d) => `dropped ${d.entryId} ${d.field} → ${d.targetId} (no entry of that group is left)`,
      ),
      ...(x.unconvertible ?? []).map((u) => `  ${u.entryId} does not convert back: ${u.reason}`),
      ...(x.done
        ? [`snapshot ${x.snapshotId}`]
        : (x.unconvertible ?? []).length > 0
          ? ["not finished: fix those values, or run the revert again with --clear"]
          : ["not finished: run the revert again"]),
    ];
  }
  const { result: x, theme } = r;
  const p = x.report;
  const verb = x.dryRun ? "would touch" : "touched";
  const lines = [
    `${p.op} ${p.collection}.${p.key}: ${verb} ${p.touched} of ${p.entries} entries (moved ${p.moved}, converted ${p.converted}, cleared ${p.cleared}, removed ${p.removed}, unchanged ${p.unchanged}, unconvertible ${p.unconvertible})`,
  ];
  for (const [locale, c] of Object.entries(p.locales))
    lines.push(`  ${locale}: ${c.touched} entries, ${c.converted} converted, ${c.cleared} cleared`);
  for (const s of p.samples)
    lines.push(
      `  ${s.entryId} (${s.locale}) ${s.kind}: ${show(s.before)} → ${show(s.after)}${s.reason ? ` (${s.reason})` : ""}`,
    );
  if (p.refusal) lines.push(`refused: ${p.refusal.message}`);
  if (theme.length)
    lines.push(`theme code reads fields.${p.key} directly and needs a change: ${theme.join(", ")}`);
  if (x.dryRun) return lines;
  if (!x.done) {
    const stuck = x.unconvertible ?? [];
    for (const u of stuck) lines.push(`  ${u.entryId} no longer converts: ${u.reason}`);
    lines.push(
      stuck.length > 0
        ? `not finished (${stuck.length} values stopped converting): fix them, or cloudhal fields continue ${p.collection} ${x.operationId} --clear`
        : `not finished (${x.skipped.length} entries changed meanwhile): cloudhal fields continue ${p.collection} ${x.operationId}`,
    );
    return lines;
  }
  lines.push(
    `operation ${x.operationId} done (undo: cloudhal fields revert ${p.collection} ${x.operationId})`,
    "nothing is live yet: review the snapshot diff and publish",
  );
  return lines;
}

/** `--sub-fields <file.json>`: a JSON list of sub-field definitions (checked by the store). */
async function readSubFields(projectDir: string, file: string): Promise<SubFieldDefinition[]> {
  const text = await readFile(path.resolve(projectDir, file), "utf8");
  const list = JSON.parse(text) as unknown;
  const record = (v: unknown) => typeof v === "object" && v !== null && !Array.isArray(v);
  if (!Array.isArray(list) || !list.every(record))
    throw new Error(`${file} holds a JSON list of sub-field definitions (objects)`);
  return list as SubFieldDefinition[];
}

/** `cloudhal fields …`. */
export const fieldsCommand: CliCommand = async (rest, values, { projectDir }) => {
  const locale = values.options ? await localDefaultLocale(projectDir) : "en";
  const req = parseFieldsArgs(
    rest,
    {
      ...(values["dry-run"] ? { dryRun: true } : {}),
      ...(values.options ? { options: values.options } : {}),
      ...(values.multiple ? { multiple: true } : {}),
      ...(values.clear ? { clear: true } : {}),
      ...(values.collections ? { collections: values.collections } : {}),
      ...(values["max-items"] ? { maxItems: values["max-items"] } : {}),
      ...(values["sub-fields"]
        ? { subFields: await readSubFields(projectDir, values["sub-fields"]) }
        : {}),
      ...(values.sub ? { sub: values.sub } : {}),
    },
    locale,
  );
  const r = await fieldsCli({ projectDir, ...remoteFlags(values) }, req);
  for (const line of describeFields(r)) console.log(line);
  if (r.kind === "run" && r.result.report.refusal && r.result.dryRun) return 1;
  return r.result.done || (r.kind === "run" && r.result.dryRun) ? 0 : 1;
};
