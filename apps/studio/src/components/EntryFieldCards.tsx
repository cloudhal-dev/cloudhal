import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { useQuery } from "@tanstack/react-query";
import { lazy, Suspense } from "react";
import { api } from "../lib/api.ts";

// RFC-0041 §7: the typed fields form loads only for collections that define fields.
const EntryFieldsCard = lazy(() =>
  import("./fields/EntryFieldsCard.tsx").then((m) => ({ default: m.EntryFieldsCard })),
);
// RFC-0045 §5: "Used by" loads only where some field can reference this collection.
const UsedByCard = lazy(() =>
  import("./fields/UsedByCard.tsx").then((m) => ({ default: m.UsedByCard })),
);

/** True when some field of the site, or a repeater's sub-field, can reference `collection`. */
function referenced(site: Site, collection: string): boolean {
  return Object.values(site.collections ?? {}).some((settings) =>
    (settings?.fields ?? []).some(
      (def) =>
        (def.type === "reference" && def.collections.includes(collection)) ||
        (def.type === "repeater" &&
          def.fields.some((s) => s.type === "reference" && s.collections.includes(collection))),
    ),
  );
}

/**
 * The entry editor's "Fields" card (RFC-0041), a lazy chunk of its own, for a collection with
 * definitions; a collection without any loads nothing.
 */
export function EntryFieldCards({
  siteId,
  site,
  entry,
  onChange,
  save,
  disabled,
}: {
  siteId: string;
  site: Site | undefined;
  entry: ContentEntry;
  onChange: (fields: Record<string, unknown>) => void;
  /** The editor's save: its error, and the entry it sent (the issues' item indices count its items). */
  save: { error: unknown; variables?: ContentEntry | undefined };
  disabled: boolean;
}) {
  if (!site?.collections?.[entry.collection]?.fields) return null;
  return (
    <Suspense fallback={null}>
      <EntryFieldsCard
        siteId={siteId}
        site={site}
        entry={entry}
        onChange={onChange}
        error={save.error}
        sent={save.variables}
        disabled={disabled}
      />
    </Suspense>
  );
}

/**
 * "Used by" (RFC-0045 §5), a lazy chunk of its own, shown only when some field of the site can
 * reference the entry's collection. It sits with the editor's reach cards, outside the read-only
 * fieldset, so "Show more" works on an article the person can't edit. The site comes from the
 * editor's cached query.
 */
export function EntryUsedByCard({ siteId, entry }: { siteId: string; entry: ContentEntry }) {
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  if (!site.data || !referenced(site.data, entry.collection)) return null;
  return (
    <Suspense fallback={null}>
      <UsedByCard siteId={siteId} site={site.data} entry={entry} />
    </Suspense>
  );
}
