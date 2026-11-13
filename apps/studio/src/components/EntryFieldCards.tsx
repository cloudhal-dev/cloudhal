import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { lazy, Suspense } from "react";

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
 * The entry editor's field cards, each a lazy chunk of its own: "Fields" for a collection with
 * definitions (RFC-0041), and "Used by" when a reference can point at this collection (RFC-0045).
 * A site without either loads neither.
 */
export function EntryFieldCards({
  siteId,
  site,
  entry,
  onChange,
  error,
  disabled,
}: {
  siteId: string;
  site: Site | undefined;
  entry: ContentEntry;
  onChange: (fields: Record<string, unknown>) => void;
  error: unknown;
  disabled: boolean;
}) {
  if (!site) return null;
  return (
    <>
      {site.collections?.[entry.collection]?.fields && (
        <Suspense fallback={null}>
          <EntryFieldsCard
            siteId={siteId}
            site={site}
            entry={entry}
            onChange={onChange}
            error={error}
            disabled={disabled}
          />
        </Suspense>
      )}
      {referenced(site, entry.collection) && (
        <Suspense fallback={null}>
          <UsedByCard siteId={siteId} site={site} entry={entry} />
        </Suspense>
      )}
    </>
  );
}
