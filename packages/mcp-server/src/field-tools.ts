/**
 * RFC-0041 §6, §8: the four field operations for agents — `rename_field`, `change_field_type`,
 * `set_field_localized` and `remove_field`. Each needs `site:write` and `content:write` (it
 * rewrites entries), always waits for a person who may change site settings (`person`-classed, so
 * `bypass` waits too), and shows that person the dry run: entries touched, values moved, converted
 * or cleared, samples before and after. `precheck` runs the same dry run, so a call that would
 * clear values without `onInvalid: "clear"` never reaches anyone.
 *
 * An operation that hits its budget answers `done: false` with its `operationId`. A person
 * continues it in Studio, or the agent calls the same tool again with that `operationId`, which
 * needs a new approval (ADR-0043 open question 9: approvals stay single use).
 */
import type { FieldOption } from "@cloudhal/core-contracts";
import { SiteSchema } from "@cloudhal/core-contracts";
import {
  continueFieldOperation,
  type FieldOperation,
  type FieldOperationName,
  type FieldOperationReport,
  type FieldOperationResult,
  fieldOperationStatus,
  InvariantError,
  runFieldOperation,
} from "@cloudhal/core-ts";
import { FIELD_TYPES, type FieldType, fieldLabel } from "@cloudhal/core-ts/fields";
import {
  id,
  type JsonSchema,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  type ToolContext,
  type ToolDefinition,
  ToolError,
  toToolError,
} from "./common.ts";

const DEFS = SiteSchema.$defs as Record<string, JsonSchema>;
const KEY = DEFS.FieldKey as JsonSchema;

const COMMON = {
  siteId: id,
  collection: str("Collection key (list_collections)", { pattern: SLUG_PATTERN, maxLength: 64 }),
  operationId: str(
    "Continue the unfinished operation this tool answered with done: false (repeat the same call with it; a person approves again)",
    { pattern: id.pattern },
  ),
  dryRun: {
    type: "boolean",
    description: "Only report what would change, without asking anyone or changing anything",
  },
} satisfies Record<string, JsonSchema>;

const COUNTS = obj({
  touched: { type: "integer" },
  moved: { type: "integer" },
  converted: { type: "integer" },
  cleared: { type: "integer" },
  removed: { type: "integer" },
  unconvertible: { type: "integer" },
  unchanged: { type: "integer" },
  entries: { type: "integer" },
});

const OUTPUT: JsonSchema = obj(
  {
    prompt: { type: "string" },
    dryRun: { type: "boolean" },
    done: { type: "boolean" },
    operationId: { type: "string" },
    report: { ...COUNTS, additionalProperties: true },
    rewritten: { type: "integer" },
    skipped: { type: "array", items: { type: "object" } },
    status: { type: "object" },
    hint: { type: "string" },
  },
  ["prompt", "dryRun", "done"],
);

interface Spec {
  name: FieldOperationName;
  title: string;
  description: string;
  input: Record<string, JsonSchema>;
  required: string[];
  destructive: boolean;
  operation: (collection: string, a: Record<string, unknown>) => FieldOperation;
}

/** What the operation does, for the prompt's first line. */
function headline(op: FieldOperation, report: FieldOperationReport, locale: string): string {
  const def = report.definition.before;
  const field = `"${quote(fieldLabel(def, locale, locale), 40)}" (${def.key}) of ${op.collection}`;
  switch (op.op) {
    case "rename_field":
      return `Rename the field ${field} to ${op.to}?`;
    case "change_field_type":
      return `Change the field ${field} from ${def.type} to ${op.type}${op.multiple ? " (multiple)" : ""}?`;
    case "set_field_localized":
      return op.localized
        ? `Make the field ${field} localized (each language version gets its own value)?`
        : `Make the field ${field} shared by all language versions (translations' own copies are deleted)?`;
    case "remove_field":
      return `Remove the field ${field} and its values from every entry?`;
  }
}

const sample = (v: unknown) =>
  v === undefined ? "nothing" : `"${quote(typeof v === "string" ? v : JSON.stringify(v), 40)}"`;

/** The approval prompt, built from the dry run (RFC-0041 §6 step 1). */
export function describeOperation(
  op: FieldOperation,
  report: FieldOperationReport,
  locale: string,
): string {
  const counts = [
    `${report.touched} of ${report.entries} entries change`,
    report.moved ? `${report.moved} values moved` : "",
    report.converted ? `${report.converted} converted` : "",
    report.cleared ? `${report.cleared} cleared` : "",
    report.removed ? `${report.removed} removed` : "",
    report.unconvertible ? `${report.unconvertible} cannot be converted` : "",
    report.unchanged ? `${report.unchanged} unchanged` : "",
  ].filter(Boolean);
  const lines = [headline(op, report, locale), `  ${counts.join(", ")}.`];
  for (const s of report.samples.slice(0, 3))
    lines.push(`  ${s.entryId} (${s.locale}): ${sample(s.before)} → ${sample(s.after)}`);
  if (op.op === "rename_field" || op.op === "change_field_type")
    lines.push(
      `  Theme code reading entry.fields.${report.key} directly stops working; themes using entryFields keep working.`,
    );
  lines.push(
    "  Snapshots are taken before and after, and it can be reverted. Only the draft changes: the live site keeps the old field until the next publish.",
  );
  return lines.join("\n");
}

async function locale(ctx: ToolContext, siteId: string): Promise<string> {
  return (await requireSite(ctx, siteId)).defaultLocale;
}

/** The unfinished operation `operationId` names, checked against this call. */
async function continued(ctx: ToolContext, siteId: string, op: FieldOperation, opId: string) {
  let status: Awaited<ReturnType<typeof fieldOperationStatus>>;
  try {
    status = await fieldOperationStatus(ctx.store, siteId, opId);
  } catch (e) {
    throw toToolError(e);
  }
  if (status.operation.op !== op.op || status.operation.collection !== op.collection)
    throw new ToolError(
      "invalid",
      `${opId} is a ${status.operation.op} on ${status.operation.collection}; call that tool with it`,
    );
  return status;
}

async function dryRun(ctx: ToolContext, siteId: string, op: FieldOperation) {
  try {
    return (
      await runFieldOperation(ctx.store, siteId, op, { actor: ctx.principal.actor, dryRun: true })
    ).report;
  } catch (e) {
    throw toToolError(e);
  }
}

/** The precheck: the dry run's refusal, or an operation id that is not this call's. */
async function precheck(spec: Spec, a: Record<string, unknown>, ctx: ToolContext) {
  const siteId = a.siteId as string;
  const site = await requireSite(ctx, siteId);
  const op = spec.operation(a.collection as string, a);
  if (typeof a.operationId === "string") {
    await continued(ctx, siteId, op, a.operationId);
    return;
  }
  // Another operation still rewriting the collection is the refusal that says what to do.
  const running = site.collections?.[op.collection]?.fields?.find((d) => d.migration)?.migration;
  if (running)
    throw toToolError(
      new InvariantError(
        "operation_in_progress",
        `field operation ${running.id} is still rewriting ${op.collection}`,
        { operationId: running.id, collection: op.collection },
      ),
    );
  const report = await dryRun(ctx, siteId, op);
  if (report.refusal)
    throw toToolError(new InvariantError(report.refusal.code, report.refusal.message, { report }));
}

async function prompt(spec: Spec, a: Record<string, unknown>, ctx: ToolContext): Promise<string> {
  const siteId = a.siteId as string;
  const op = spec.operation(a.collection as string, a);
  if (typeof a.operationId === "string") {
    const status = await continued(ctx, siteId, op, a.operationId);
    return `Continue the field operation ${status.operationId} (${op.op} on ${op.collection}, started earlier)? ${status.pending} entries are still to rewrite.`;
  }
  return describeOperation(op, await dryRun(ctx, siteId, op), await locale(ctx, siteId));
}

function answer(r: FieldOperationResult, promptText: string) {
  return {
    prompt: promptText,
    dryRun: r.dryRun,
    done: r.done,
    ...(r.operationId ? { operationId: r.operationId } : {}),
    report: r.report,
    rewritten: r.rewritten,
    skipped: r.skipped,
    ...(!r.dryRun && !r.done
      ? {
          hint: `The operation stopped at its budget. A person can continue it in Studio, or call ${r.report.op} again with operationId "${r.operationId}" (it needs a new approval).`,
        }
      : {}),
  };
}

async function handle(spec: Spec, a: Record<string, unknown>, ctx: ToolContext) {
  const siteId = a.siteId as string;
  const op = spec.operation(a.collection as string, a);
  const options = { actor: ctx.principal.actor, ...(ctx.now ? { now: ctx.now } : {}) };
  try {
    if (typeof a.operationId === "string") {
      const status = await continued(ctx, siteId, op, a.operationId);
      // A dry run of a continuation only says where the operation stands.
      if (a.dryRun === true)
        return {
          prompt: await prompt(spec, a, ctx),
          dryRun: true,
          done: status.state !== "running",
          operationId: status.operationId,
          status,
        };
      const r = await continueFieldOperation(ctx.store, siteId, status.operationId, options);
      return answer(r, describeOperation(op, r.report, await locale(ctx, siteId)));
    }
    const r = await runFieldOperation(ctx.store, siteId, op, {
      ...options,
      dryRun: a.dryRun === true,
    });
    return answer(r, describeOperation(op, r.report, await locale(ctx, siteId)));
  } catch (e) {
    throw toToolError(e);
  }
}

function operationTool(spec: Spec): ToolDefinition {
  return {
    name: spec.name,
    title: spec.title,
    description: `${spec.description} Needs a person who may change site settings in every mode; the approval shows the dry run (entries touched, values changed, samples). dryRun: true reports without asking. Snapshots before and after; revertible; only the draft changes until the next publish. A run that stops at its budget answers done: false with an operationId: call again with it (a new approval) or let a person continue it in Studio.`,
    inputSchema: obj({ ...COMMON, ...spec.input }, ["siteId", "collection", ...spec.required]),
    outputSchema: OUTPUT,
    annotations: {
      readOnlyHint: false,
      destructiveHint: spec.destructive,
      idempotentHint: false,
      openWorldHint: false,
    },
    scopes: ["site:write", "content:write"],
    approverScopes: ["site:settings"],
    requiresApproval: true,
    classify: (a) => (a.dryRun === true ? "read" : "person"),
    precheck: (a, ctx) => precheck(spec, a, ctx),
    approvalPrompt: (a, ctx) => prompt(spec, a, ctx),
    handler: (a, ctx) => handle(spec, a, ctx),
  };
}

const SPECS: Spec[] = [
  {
    name: "rename_field",
    title: "Rename field",
    description:
      "Rename a typed custom field's key (RFC-0041 §6): every entry's value moves from `from` to `to`; nothing is converted.",
    input: {
      from: { ...KEY, description: "The field's current key" },
      to: { ...KEY, description: "The new key" },
    },
    required: ["from", "to"],
    destructive: false,
    operation: (collection, a) => ({
      op: "rename_field",
      collection,
      from: a.from as string,
      to: a.to as string,
    }),
  },
  {
    name: "change_field_type",
    title: "Change field type",
    description:
      "Change a typed custom field's type, or a select's multiple (RFC-0041 §6), converting every value by a closed table (text↔richText, text↔number, text↔select, text↔url, date↔datetime, single↔multiple select). Values that cannot be converted refuse the call unless onInvalid is \"clear\".",
    input: {
      key: { ...KEY, description: "The field's key" },
      type: str("The new type", { enum: [...FIELD_TYPES] }),
      options: {
        type: "array",
        description:
          "A new select's options (default: the field's own when it already is a select)",
        minItems: 1,
        maxItems: 50,
        items: { $ref: "#/$defs/FieldOption" },
        $defs: { FieldOption: DEFS.FieldOption, Slug: DEFS.Slug, Locale: DEFS.Locale },
      },
      multiple: { type: "boolean", description: "For a select: the value is a list of options" },
      onInvalid: str("Drop values that cannot be converted (the person approving sees how many)", {
        enum: ["clear"],
      }),
    },
    required: ["key", "type"],
    destructive: true,
    operation: (collection, a) => ({
      op: "change_field_type",
      collection,
      key: a.key as string,
      type: a.type as FieldType,
      ...(a.options ? { options: a.options as FieldOption[] } : {}),
      ...(typeof a.multiple === "boolean" ? { multiple: a.multiple } : {}),
      ...(a.onInvalid === "clear" ? { onInvalid: "clear" as const } : {}),
    }),
  },
  {
    name: "set_field_localized",
    title: "Set field localization",
    description:
      "Make a typed custom field localized (each language version has its own value; translations fall back to the original's) or shared (only the original holds it; translations' own copies are deleted) (RFC-0041 §5, §6).",
    input: {
      key: { ...KEY, description: "The field's key" },
      localized: { type: "boolean", description: "true: per language version; false: shared" },
    },
    required: ["key", "localized"],
    destructive: false,
    operation: (collection, a) => ({
      op: "set_field_localized",
      collection,
      key: a.key as string,
      localized: a.localized as boolean,
    }),
  },
  {
    name: "remove_field",
    title: "Remove field",
    description:
      "Remove a typed custom field (RFC-0041 §6): its value is deleted from every entry, then its definition.",
    input: { key: { ...KEY, description: "The field's key" } },
    required: ["key"],
    destructive: true,
    operation: (collection, a) => ({ op: "remove_field", collection, key: a.key as string }),
  },
];

/** rename_field … remove_field, after the collection tools. */
export function fieldTools(): ToolDefinition[] {
  return SPECS.map(operationTool);
}
