/**
 * "Ended (collection rule)" in Studio (RFC-0042 §3.3, #113): whether a published entry has ended
 * under its collection's expiry, computed with the same `derivedGate` / `entryVisibility` the
 * site uses, so the badge and the site agree to the millisecond. The entry's own state speaks
 * first, as in the renderer preview (`gateNoticeHtml || derivedGateNoticeHtml`): drafts,
 * embargoed entries and entries whose own "Hide after" has passed get no badge. A translation
 * reads its original only while the original is published, as the site does
 * (`derivedGates(site, published)`). The gate's end is exclusive, so `now === at` has already
 * ended. Pure; loads with the badge only (`LAZY_ONLY`).
 */
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import {
  type DerivedGate,
  derivedGate,
  entryVisibility,
  type FieldsOriginal,
  isKnownTimeZone,
} from "@cloudhal/core-ts/fields";

/** The entry has ended under its collection's rule: the gate, the rule's field and its definition. */
export interface EndedByRule {
  gate: DerivedGate;
  fieldKey: string;
  field: FieldDefinition | undefined;
}

/** A translation's original as the rule reads it: its values and whether it is published. */
export type GateOriginal = FieldsOriginal & Pick<ContentEntry, "status">;

/**
 * The collection's derived gate when it, and nothing of the entry's own, keeps the entry off the
 * site at `now`: published, its own `availability` open, and the derived gate passed.
 * `undefined` otherwise (no rule, no readable value, not yet ended, or the entry's own state).
 * A draft, in-review or archived original is not read, as on the site (it takes originals from
 * published entries only): the translation then reads only its own values, which hold no
 * non-localized date, so it stays listed.
 */
export function endedByRule(
  site: Site,
  entry: ContentEntry,
  original: GateOriginal | undefined,
  now: number,
): EndedByRule | undefined {
  const gate = derivedGate(site, entry, original?.status === "published" ? original : undefined);
  if (!gate) return undefined;
  if (entryVisibility(entry, undefined, now) !== "shown") return undefined;
  if (entryVisibility(entry, gate, now) === "shown") return undefined;
  const settings = site.collections?.[entry.collection];
  const fieldKey = settings?.expiry?.field ?? "";
  return { gate, fieldKey, field: settings?.fields?.find((d) => d.key === fieldKey) };
}

/** The zone the site's gates use, for showing the instant: the site's, or UTC when unknown. */
export function gateZone(site: Pick<Site, "timeZone">): string {
  return site.timeZone && isKnownTimeZone(site.timeZone) ? site.timeZone : "UTC";
}

/**
 * The id of the same-site original a translation reads its non-localized values from
 * (EntryFieldsCard's `useOriginal` rule); `undefined` for originals and language editions.
 */
export function originalIdOf(entry: Pick<ContentEntry, "id" | "translation">): string | undefined {
  const tr = entry.translation;
  return tr && tr.group !== entry.id && !tr.source?.siteId ? tr.group : undefined;
}
