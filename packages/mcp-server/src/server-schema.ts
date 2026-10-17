/**
 * Tool schemas as the MCP server registers them: the approval fields a gated tool accepts, compiled
 * once per process. The HTTP transport builds a server per request, so the tool list and the
 * compiled validators are built once: compiling every tool's schemas took most of each call's
 * time, and each fresh schema object stayed in the validator's cache for good.
 */
import { fromJsonSchema } from "@modelcontextprotocol/server";
import { defineTools, type ToolDefinition } from "./tools.ts";

let defaultTools: ToolDefinition[] | undefined;
export function defaultToolList(): ToolDefinition[] {
  if (!defaultTools) defaultTools = defineTools();
  return defaultTools;
}
const compiled = new WeakMap<object, Map<string, ReturnType<typeof fromJsonSchema>>>();

/** `fromJsonSchema` once per schema object and variant (the extra approval fields it gets). */
export function compiledSchema(
  schema: ToolDefinition["inputSchema"],
  variant: string,
  build: () => ToolDefinition["inputSchema"],
): ReturnType<typeof fromJsonSchema<Record<string, unknown>>> {
  let byVariant = compiled.get(schema);
  if (!byVariant) {
    byVariant = new Map();
    compiled.set(schema, byVariant);
  }
  let out = byVariant.get(variant);
  if (!out) {
    out = fromJsonSchema<Record<string, unknown>>(build() as Parameters<typeof fromJsonSchema>[0]);
    byVariant.set(variant, out);
  }
  return out as ReturnType<typeof fromJsonSchema<Record<string, unknown>>>;
}

const gated = (def: ToolDefinition) =>
  def.requiresApproval ||
  def.annotations.destructiveHint === true ||
  // classified calls may need a person (RFC-0007 §10.2)
  def.classify !== undefined;

/**
 * The input schema a tool is registered with. Any tool that writes can need a person (manual mode
 * makes every write gated), so with out-of-band approvals it also takes `approvalId`, and with the
 * local fallback `confirmToken`.
 */
export function registeredInputSchema(
  def: ToolDefinition,
  { approvals, fallback }: { approvals: boolean; fallback: boolean },
) {
  const extended = gated(def) || (approvals && def.annotations.readOnlyHint !== true);
  const variant = extended ? `${approvals ? "a" : ""}${fallback ? "c" : ""}` : "";
  return compiledSchema(def.inputSchema, variant, () =>
    extended
      ? {
          ...def.inputSchema,
          properties: {
            ...(def.inputSchema.properties as Record<string, unknown>),
            ...(approvals
              ? {
                  approvalId: {
                    type: "string",
                    pattern: "^appr_[A-Z0-9]{10,40}$",
                    description:
                      "After a person approved your earlier request in Studio: the approvalId it returned. Same arguments as that request.",
                  },
                }
              : {}),
            ...(fallback
              ? {
                  confirmToken: {
                    type: "string",
                    description:
                      "Only after a person approved this exact call: the token the server handed back with the approval request.",
                  },
                }
              : {}),
          },
        }
      : def.inputSchema,
  );
}
