/**
 * RFC-0041 §3, §8: field issues as the store's refusal. Every issue keeps its slash path in
 * `details.issues`, so the API and MCP answer with each problem where it sits. The error's code is
 * the issues' shared code (`invalid_value` reads `invalid_fields`); mixed value problems are
 * `invalid_fields`, and mixed definition problems take the first one's code, with
 * `field_change_needs_operation` first because it names what to do.
 */
import { type InvariantCode, InvariantError } from "../errors.ts";
import type { FieldIssue, FieldIssueCode } from "./types.ts";

/** Issue codes about definitions (site writes) rather than values (entry writes). */
const DEFINITION_CODES = new Set<FieldIssueCode>([
  "field_key_reserved",
  "field_key_duplicate",
  "field_option_duplicate",
  "field_bounds",
  "too_many_fields",
  "field_change_needs_operation",
]);

const asInvariant = (code: FieldIssueCode): InvariantCode =>
  code === "invalid_value" || code === "field_value_unreadable" ? "invalid_fields" : code;

/** The refusal's code for a non-empty list of issues. */
export function fieldRefusalCode(issues: readonly FieldIssue[]): InvariantCode {
  const first = issues[0];
  if (!first) return "invalid_fields";
  if (issues.every((i) => i.code === first.code)) return asInvariant(first.code);
  if (issues.some((i) => i.code === "field_change_needs_operation"))
    return "field_change_needs_operation";
  const definition = issues.find((i) => DEFINITION_CODES.has(i.code));
  return definition ? asInvariant(definition.code) : "invalid_fields";
}

/** Throws the store's refusal for `issues`; returns when there are none. */
export function refuseFieldIssues(
  issues: readonly FieldIssue[],
  details: Record<string, unknown> = {},
): void {
  if (issues.length === 0) return;
  const shown = issues
    .slice(0, 5)
    .map((i) => `${i.path}: ${i.message}`)
    .join("; ");
  const more = issues.length > 5 ? ` (and ${issues.length - 5} more)` : "";
  throw new InvariantError(fieldRefusalCode(issues), `${shown}${more}`, {
    ...details,
    issues: [...issues],
  });
}
