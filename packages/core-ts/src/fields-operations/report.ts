/**
 * RFC-0041 §6 step 1: the dry run's report. Entries touched, values moved, converted, cleared,
 * removed, unchanged and unconvertible (in total and per locale), and up to five samples, the
 * unconvertible ones first. The approval prompt and Studio's dialog are built from it; a type
 * change with unconvertible values and no `onInvalid: "clear"` carries its refusal.
 */
import type { FieldDefinition } from "@cloudhal/core-contracts";
import type { Decide, Row } from "./rewrite.ts";
import { isSameSiteTranslation } from "./rewrite.ts";
import {
  type FieldOperation,
  type FieldOperationReport,
  type FieldOperationSample,
  type FieldValueCounts,
  finalKey,
  operationKey,
} from "./types.ts";

const SAMPLES = 5;
const SAMPLE_CHARS = 200;

const zero = (): FieldValueCounts => ({
  touched: 0,
  moved: 0,
  converted: 0,
  cleared: 0,
  removed: 0,
  unconvertible: 0,
});

/** Long strings shortened for a prompt (values are data, quoted by whoever shows them). */
function short(value: unknown): unknown {
  if (typeof value === "string" && value.length > SAMPLE_CHARS)
    return `${value.slice(0, SAMPLE_CHARS)}…`;
  return value;
}

export interface ReportInput {
  readonly op: FieldOperation;
  readonly before: FieldDefinition;
  readonly after: FieldDefinition | null;
  readonly rows: readonly Row[];
  readonly decide: Decide;
}

export function buildReport(input: ReportInput): FieldOperationReport {
  const { op, rows, decide } = input;
  const keys = [operationKey(op), finalKey(op)];
  const total = zero();
  const locales: Record<string, FieldValueCounts> = {};
  const samples: FieldOperationSample[] = [];
  let unchanged = 0;
  for (const row of rows) {
    const e = row.entry;
    const d = decide(row, isSameSiteTranslation(e));
    const change = d?.change;
    if (!change) {
      if (keys.some((k) => e.fields && Object.hasOwn(e.fields, k))) unchanged++;
      continue;
    }
    const per = locales[e.locale] ?? zero();
    locales[e.locale] = per;
    for (const c of [total, per]) {
      c[change.kind]++;
      if (d.fields || d.replace) c.touched++;
    }
    samples.push({
      entryId: e.id,
      locale: e.locale,
      kind: change.kind,
      before: short(change.before),
      after: short(change.after),
      ...(change.reason ? { reason: change.reason } : {}),
    });
  }
  samples.sort((a, b) => Number(b.kind === "unconvertible") - Number(a.kind === "unconvertible"));
  const clears = op.op === "change_field_type" && op.onInvalid === "clear";
  return {
    op: op.op,
    collection: op.collection,
    key: operationKey(op),
    entries: rows.length,
    ...total,
    unchanged,
    locales,
    samples: samples.slice(0, SAMPLES),
    definition: { before: input.before, after: input.after },
    ...(total.unconvertible > 0 && !clears
      ? {
          refusal: {
            code: "field_values_unconvertible" as const,
            message: `${total.unconvertible} value(s) of ${operationKey(op)} cannot be converted to ${input.after?.type}; fix them first, or run with onInvalid: "clear" to drop them`,
          },
        }
      : {}),
  };
}
