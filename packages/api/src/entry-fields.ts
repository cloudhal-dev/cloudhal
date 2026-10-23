/**
 * RFC-0041 §2: `null` is never stored. In a collection with typed fields an API input uses `null`
 * to remove a key, so the entry routes drop such keys before the store checks the values
 * (`invalid_fields`, `unknown_field`, … with each issue's path in `details.issues`). Collections
 * without definitions keep `fields` as "any JSON", nulls included, as before.
 */

import type { SiteGraphStore } from "@cloudhal/core-ts";
import { fieldDefinitions } from "@cloudhal/core-ts/fields";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** `input` with `null` field values removed when its collection defines fields. */
export async function withoutNullFields<T extends { collection?: unknown; fields?: unknown }>(
  store: SiteGraphStore,
  siteId: string,
  input: T,
): Promise<T> {
  const fields = input.fields;
  if (!isRecord(fields) || !Object.values(fields).includes(null)) return input;
  if (typeof input.collection !== "string") return input;
  const site = await store.getSite(siteId);
  if (!site || fieldDefinitions(site, input.collection).length === 0) return input;
  return {
    ...input,
    fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)),
  };
}
