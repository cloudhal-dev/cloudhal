/**
 * RFC-0041 and RFC-0042: what an agent does next after a typed-field, listing, expiry or
 * structured-data refusal. Every refusal keeps its issues in
 * `details.issues`, each at its slash path (`fields/startsAt/at`), so the hint only names the tool.
 */
import type { InvariantCode } from "@cloudhal/core-ts";

const OPERATIONS = "rename_field, change_field_type, set_field_localized or remove_field";

const HINTS: Partial<Record<InvariantCode, string>> = {
  invalid_fields:
    "fix the values at the paths in details.issues; list_collections shows the collection's fieldsSchema (types, allowed values, limits)",
  unknown_field:
    "use one of the collection's field keys (list_collections → fieldsSchema); a new field is added with update_collection, which a person approves",
  field_not_localized:
    "that field is shared by every language version: set it on the original entry named in the message, and leave it out of the translation",
  required_field:
    "give the fields named in details.issues a value (update_entry with fields), or keep the entry a draft",
  field_key_reserved:
    "pick another key: built-in entry properties (title, slug, body, …) cannot be field keys",
  field_key_duplicate: "every field key appears once per collection",
  field_option_duplicate: "every option value appears once per select field",
  field_bounds: "a number field's minimum must not be above its maximum",
  too_many_fields:
    "a collection has at most 30 fields, a site 200 and a select 50 options; remove some first",
  field_change_needs_operation: `that change could lose or reinterpret stored values: use ${OPERATIONS} (each shows a dry run and waits for a person; try dryRun: true first)`,
  operation_in_progress:
    "a person can continue or revert it in Studio, or call the same operation tool again with that operationId (it needs a new approval)",
  field_values_unconvertible:
    'details.report.samples shows the values; change them first (update_entry), or call again with onInvalid: "clear" to drop them (the person approving sees how many)',
  field_operation_incomplete:
    "call the operation tool again with its operationId to finish it (a new approval), or ask a person to continue it in Studio",
  // RFC-0042 (listings, expiry, structured data)
  invalid_query:
    "fix the conditions at the paths in details.issues: only the collection's listFields may be queried, with the operators list_collections shows per field (listFields[].ops); dates are YYYY-MM-DD, instants RFC 3339, or now",
  structured_data_invalid:
    "fix the mappings at the paths in details.issues: list_collections shows a preset's paths, which are required and the sources each takes (structuredData.paths); field sources need a field of a fitting type, and required values come from the entry, never a constant",
  invalid_expiry:
    "expiry.field must be a date or datetime field of the collection (list_collections → fields)",
  list_field_in_use:
    "contentList sections on the pages in details.pages still filter or sort by that field: change their where/orderBy first (update_page), then try again",
};

const GATES_EXPIRY =
  "a collection expiry needs a site Worker that enforces derived gates: ask a person to deploy the current site (cloudhal deploy), then try again; until then leave expiry out (the rest of the change can go ahead without it)";
const GATES_AVAILABILITY =
  "the site's renderer has not confirmed it enforces time gates: ask a person to deploy the current site (cloudhal deploy) before setting embargoes or expiries";

/** The next step for a field refusal; undefined for codes that are not about fields. */
export function fieldHint(code: InvariantCode, details: Readonly<Record<string, unknown>>) {
  if (code === "gates_unsupported")
    return Array.isArray(details.collections) ? GATES_EXPIRY : GATES_AVAILABILITY;
  if (code === "too_large" && Array.isArray(details.issues))
    return "field values are at most 256 KB per entry and collection settings 256 KB per site; shorten or drop values";
  return HINTS[code];
}
