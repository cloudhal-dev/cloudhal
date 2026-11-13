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
 *
 * RFC-0045 §7 (rollout step 4's inputs, as the admin API takes them): `sub` names a repeater's
 * sub-field (rename, type change, removal); `change_field_type` takes `collections`, `maxItems`,
 * `subFields` and `itemLabel` for a reference or repeater target, and a continuation takes
 * `onInvalid: "clear"` to drop values that stopped converting while it ran (`unconvertible`). The
 * target types follow the store's capability (`FieldTypeOptions`), and the dry run refuses them
 * (`fields_unsupported`) where the store does not accept them.
 */
import type { FieldOption, SubFieldDefinition } from "@cloudhal/core-contracts";
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
import { ALL_FIELD_TYPES, FIELD_TYPES, type FieldType, fieldLabel } from "@cloudhal/core-ts/fields";
import type { FieldTypeOptions } from "./collection-fields.ts";
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
import { defsClosure } from "./schema-transforms.ts";

const DEFS = SiteSchema.$defs as Record<string, JsonSchema>;
const KEY = DEFS.FieldKey as JsonSchema;

/** RFC-0045 §7: a repeater's sub-field the operation applies to. */
const SUB: JsonSchema = {
  ...KEY,
  description:
    "A repeater's sub-field key: the operation applies to that sub-field in every item (key/from names the repeater)",
};
const sub = (a: Record<string, unknown>) => (typeof a.sub === "string" ? { sub: a.sub } : {});

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
    unconvertible: { type: "array", items: { type: "object" } },
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

/** The sub-field an operation names, as the prompt says it. */
function subOf(op: FieldOperation, def: FieldOperationReport["definition"]["before"]) {
  if (op.op === "set_field_localized" || op.sub === undefined) return undefined;
  const field = def.type === "repeater" ? def.fields.find((s) => s.key === op.sub) : undefined;
  return { key: op.sub, type: field?.type };
}

/** What the operation does, for the prompt's first line. */
function headline(op: FieldOperation, report: FieldOperationReport, locale: string): string {
  const def = report.definition.before;
  const label = `"${quote(fieldLabel(def, locale, locale), 40)}" (${def.key}) of ${op.collection}`;
  const part = subOf(op, def);
  const field = part ? `sub-field ${part.key} of the field ${label}` : `field ${label}`;
  switch (op.op) {
    case "rename_field":
      return `Rename the ${field} to ${op.to}?`;
    case "change_field_type":
      return `Change the ${field} from ${part ? (part.type ?? "?") : def.type} to ${op.type}${op.multiple ? " (multiple)" : ""}?`;
    case "set_field_localized":
      return op.localized
        ? `Make the ${field} localized (each language version gets its own value)?`
        : `Make the ${field} shared by all language versions (translations' own copies are deleted)?`;
    case "remove_field":
      return part
        ? `Remove the ${field} and its values from every item?`
        : `Remove the ${field} and its values from every entry?`;
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
    const clear =
      a.onInvalid === "clear" ? " Values that stopped converting meanwhile are dropped." : "";
    return `Continue the field operation ${status.operationId} (${op.op} on ${op.collection}, started earlier)? ${status.pending} entries are still to rewrite.${clear}`;
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
    ...(r.unconvertible.length ? { unconvertible: r.unconvertible } : {}),
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
      const r = await continueFieldOperation(ctx.store, siteId, status.operationId, {
        ...options,
        ...(a.onInvalid === "clear" ? { onInvalid: "clear" as const } : {}),
      });
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

/** The four operations; `change_field_type`'s target types follow the store's capability. */
function specs(options: FieldTypeOptions): Spec[] {
  return [
    {
      name: "rename_field",
      title: "Rename field",
      description:
        "Rename a typed custom field's key (RFC-0041 §6): every entry's value moves from `from` to `to`; nothing is converted.",
      input: {
        from: { ...KEY, description: "The field's current key" },
        to: { ...KEY, description: "The new key (with sub: the sub-field's new key)" },
        sub: SUB,
      },
      required: ["from", "to"],
      destructive: false,
      operation: (collection, a) => ({
        op: "rename_field",
        collection,
        from: a.from as string,
        to: a.to as string,
        ...sub(a),
      }),
    },
    {
      name: "change_field_type",
      title: "Change field type",
      description:
        "Change a typed custom field's type, or a select's multiple (RFC-0041 §6), converting every value by a closed table (text↔richText, text↔number, text↔select, text↔url, date↔datetime, single↔multiple select; RFC-0045 where reference and repeater fields are enabled: text↔reference, single↔multiple reference, multiline text↔repeater, multiple reference↔repeater, and with sub a repeater's sub-field). Values that cannot be converted refuse the call unless onInvalid is \"clear\".",
      input: {
        key: { ...KEY, description: "The field's key" },
        type: str("The new type", {
          enum: [...(options.referenceTypes ? ALL_FIELD_TYPES : FIELD_TYPES)],
        }),
        sub: SUB,
        options: {
          type: "array",
          description:
            "A new select's options (default: the field's own when it already is a select)",
          minItems: 1,
          maxItems: 50,
          items: { $ref: "#/$defs/FieldOption" },
          $defs: { FieldOption: DEFS.FieldOption, Slug: DEFS.Slug, Locale: DEFS.Locale },
        },
        multiple: {
          type: "boolean",
          description: "For a select or a reference: the value is a list",
        },
        collections: {
          type: "array",
          description: "To a reference: the collections a target may belong to (list_collections)",
          minItems: 1,
          maxItems: 5,
          uniqueItems: true,
          items: { type: "string", pattern: SLUG_PATTERN, maxLength: 64 },
        },
        maxItems: {
          type: "integer",
          minimum: 1,
          maximum: 50,
          description: "To a multiple reference or a repeater: at most this many targets or items",
        },
        subFields: {
          type: "array",
          description: "To a repeater: its sub-fields, in form order",
          minItems: 1,
          maxItems: 10,
          items: { $ref: "#/$defs/SubFieldDefinition" },
          $defs: defsClosure(SiteSchema as JsonSchema, "SubFieldDefinition"),
        },
        itemLabel: {
          ...KEY,
          description: "To a repeater: the text, select or reference sub-field that names an item",
        },
        onInvalid: str(
          "Drop values that cannot be converted (the person approving sees how many); with operationId, also the values that stopped converting while it ran (unconvertible)",
          { enum: ["clear"] },
        ),
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
        ...(Array.isArray(a.collections) ? { collections: a.collections as string[] } : {}),
        ...(typeof a.maxItems === "number" ? { maxItems: a.maxItems } : {}),
        ...(Array.isArray(a.subFields) ? { subFields: a.subFields as SubFieldDefinition[] } : {}),
        ...(typeof a.itemLabel === "string" ? { itemLabel: a.itemLabel } : {}),
        ...(a.onInvalid === "clear" ? { onInvalid: "clear" as const } : {}),
        ...sub(a),
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
      input: { key: { ...KEY, description: "The field's key" }, sub: SUB },
      required: ["key"],
      destructive: true,
      operation: (collection, a) => ({
        op: "remove_field",
        collection,
        key: a.key as string,
        ...sub(a),
      }),
    },
  ];
}

/** rename_field … remove_field, after the collection tools. */
export function fieldTools(options: FieldTypeOptions = {}): ToolDefinition[] {
  return specs(options).map(operationTool);
}
