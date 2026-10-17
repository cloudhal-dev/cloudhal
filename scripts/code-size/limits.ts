/**
 * Cloudhal's size limits (docs/engineering/code-structure.md §2). `soft` is review guidance and
 * shows up in the report; `hard` fails `pnpm size:check` unless the file or function is in
 * scripts/size-baseline.json, and then it may not grow past its baselined value.
 */
import type { FileMetric, FunctionMetric, Lang } from "./measure.ts";

export interface Limit {
  soft: number;
  hard: number;
}

export const FILE_LIMITS: Record<Lang | "test", Limit> = {
  ts: { soft: 400, hard: 800 },
  js: { soft: 400, hard: 800 },
  astro: { soft: 250, hard: 500 },
  css: { soft: 400, hard: 800 },
  // Rust keeps unit tests inline (`#[cfg(test)] mod tests`), so files run longer.
  rs: { soft: 500, hard: 1000 },
  // Behavioural suites (`*.test.ts`, `testing*.ts`, fixtures) are tables of cases.
  test: { soft: 800, hard: 1500 },
};

/** Function and method limits; functions in test files are exempt (describe/it bodies). */
export const FUNCTION_LIMITS = {
  lines: { soft: 80, hard: 150 },
  depth: { soft: 4, hard: 5 },
  params: { soft: 3, hard: 4 },
  complexity: { soft: 15, hard: 30 },
} satisfies Record<string, Limit>;

/** One string literal or template (runtime client code, SQL, help text), in characters. */
export const STRING_LIMITS: Limit = { soft: 6000, hard: 12000 };

export const fileLimit = (f: FileMetric): Limit => FILE_LIMITS[f.test ? "test" : f.lang];

/** The function measures the ratchet enforces (complexity is reported; Biome warns on it). */
export const ENFORCED_FUNCTION_MEASURES = ["lines", "depth", "params"] as const;
export type FunctionMeasure = (typeof ENFORCED_FUNCTION_MEASURES)[number];

export const functionKey = (f: FunctionMetric) => `${f.file}::${f.name}`;
