/**
 * The size ratchet (docs/engineering/code-structure.md §8). Fails when a file or function is
 * over its hard limit and not in scripts/size-baseline.json, or when a baselined one grew.
 *
 *   node scripts/size-check.ts              # check (part of `pnpm check`)
 *   node scripts/size-check.ts --update     # tighten the baseline to today's sizes
 *   node scripts/size-check.ts --update --allow-growth   # also accept growth / new entries
 *
 * `--update` without `--allow-growth` only ever lowers numbers or drops entries, so it is safe
 * to run after a refactor; `--allow-growth` is for a reviewed exception and shows in the diff.
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  ENFORCED_FUNCTION_MEASURES,
  FUNCTION_LIMITS,
  type FunctionMeasure,
  fileLimit,
  functionKey,
  STRING_LIMITS,
} from "./code-size/limits.ts";
import { type FunctionMetric, measure, ROOT } from "./code-size/measure.ts";

type FunctionEntry = Partial<Record<FunctionMeasure, number>>;
interface Baseline {
  $comment: string;
  files: Record<string, number>;
  functions: Record<string, FunctionEntry>;
  strings: Record<string, number>;
}

const BASELINE_PATH = path.join(ROOT, "scripts/size-baseline.json");
const update = process.argv.includes("--update");
const allowGrowth = process.argv.includes("--allow-growth");

function readBaseline(): Baseline {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;
  } catch {
    return { $comment: "", files: {}, functions: {}, strings: {} };
  }
}

const baseline = readBaseline();
const m = measure();
const errors: string[] = [];
const loose: string[] = [];
const next: Baseline = {
  $comment:
    "Oversized files and functions as of their last tightening. Entries may only shrink: run `node scripts/size-check.ts --update` after a refactor. See docs/engineering/code-structure.md.",
  files: {},
  functions: {},
  strings: {},
};

/** Compares one measure against its hard limit and baseline; returns the value to baseline. */
function ratchet(label: string, value: number, hard: number, base: number | undefined) {
  if (value <= hard) {
    if (base !== undefined) loose.push(`${label}: ${base} → ${value} (now within the limit)`);
    return undefined;
  }
  if (base === undefined) {
    errors.push(`${label}: ${value} > hard limit ${hard} (new)`);
    return allowGrowth ? value : undefined;
  }
  if (value > base) {
    errors.push(`${label}: grew ${base} → ${value} (baselined, limit ${hard})`);
    return allowGrowth ? value : base;
  }
  if (value < base) loose.push(`${label}: ${base} → ${value}`);
  return value;
}

for (const f of m.files) {
  const kept = ratchet(`${f.file} lines`, f.lines, fileLimit(f).hard, baseline.files[f.file]);
  if (kept !== undefined) next.files[f.file] = kept;
}

// A function renamed by a shifted `#n` (another anonymous callback added above it) keeps its
// baseline: unmatched violators pick up an unmatched entry with the same base name in the file.
const present = new Set(m.functions.map(functionKey));
const orphans = Object.keys(baseline.functions).filter((k) => !present.has(k));
const baseName = (key: string) => key.replace(/#\d+$/, "");
function baselineFor(f: FunctionMetric): FunctionEntry | undefined {
  const exact = baseline.functions[functionKey(f)];
  if (exact) return exact;
  const i = orphans.findIndex((k) => baseName(k) === baseName(functionKey(f)));
  return i === -1 ? undefined : baseline.functions[orphans.splice(i, 1)[0] as string];
}

for (const f of m.functions) {
  if (f.test) continue;
  const over = ENFORCED_FUNCTION_MEASURES.some((k) => f[k] > FUNCTION_LIMITS[k].hard);
  const base = over ? baselineFor(f) : baseline.functions[functionKey(f)];
  if (!over && !base) continue;
  const entry: FunctionEntry = {};
  for (const k of ENFORCED_FUNCTION_MEASURES) {
    const label = `${f.file}:${f.line} ${f.name} ${k}`;
    const kept = ratchet(label, f[k], FUNCTION_LIMITS[k].hard, base?.[k]);
    if (kept !== undefined) entry[k] = kept;
  }
  if (Object.keys(entry).length > 0) next.functions[functionKey(f)] = entry;
}

for (const s of m.strings) {
  const key = `${s.file}::${s.owner}`;
  const label = `${s.file}:${s.line} string ${s.owner} chars`;
  const kept = ratchet(label, s.chars, STRING_LIMITS.hard, baseline.strings?.[key]);
  if (kept !== undefined) next.strings[key] = kept;
}

const sortKeys = <T>(o: Record<string, T>) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

if (update) {
  next.files = sortKeys(next.files);
  next.functions = sortKeys(next.functions);
  next.strings = sortKeys(next.strings);
  writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `size:check baseline written: ${Object.keys(next.files).length} files, ${Object.keys(next.functions).length} functions.`,
  );
  if (errors.length > 0 && !allowGrowth) {
    console.error(`${errors.length} violation(s) were not baselined (pass --allow-growth):`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    process.exit(1);
  }
  process.exit(0);
}

const files = Object.keys(baseline.files).length;
const functions = Object.keys(baseline.functions).length;
if (loose.length > 0) {
  console.log(`size:check: ${loose.length} baseline entr(y/ies) can be tightened — run`);
  console.log("  node scripts/size-check.ts --update");
  for (const l of loose.slice(0, 10)) console.log(`  ↓ ${l}`);
  if (loose.length > 10) console.log(`  … and ${loose.length - 10} more`);
}
if (errors.length > 0) {
  console.error(`size:check failed (docs/engineering/code-structure.md):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  console.error(
    "Split the file or function (see the doc's split patterns). A reviewed exception: node scripts/size-check.ts --update --allow-growth",
  );
  process.exit(1);
}
console.log(
  `size:check ok — ${m.files.length} files, ${m.functions.length} functions; baseline holds ${files} files, ${functions} functions and ${Object.keys(baseline.strings ?? {}).length} strings that may only shrink.`,
);
