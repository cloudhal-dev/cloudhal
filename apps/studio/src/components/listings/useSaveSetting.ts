/**
 * RFC-0042 §7: one stage 3 card's save — `PUT …/collections/:key` with the collection's current
 * settings and only this card's setting replaced, so the cards never undo each other.
 */
import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { withSetting } from "../../lib/listings.ts";
import { useToast } from "../Toast.ts";

type StageKey = "listFields" | "expiry" | "structuredData";

export function useSaveSetting<K extends StageKey>(
  site: Site,
  collection: string,
  key: K,
  savedText: string,
) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (value: CollectionSettings[K] | undefined) => {
      const current = site.collections?.[collection] ?? {};
      return api.collections.save(site, collection, withSetting(current, key, value));
    },
    onSuccess: async ({ site: saved }) => {
      qc.setQueryData(["site", site.id], saved);
      await qc.invalidateQueries({ queryKey: ["collections", site.id] });
      toast.success(savedText, t("common.rev", { rev: saved.rev }));
    },
  });
}

/** JSON with object keys sorted, so the server's key order does not read as a change. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
    );
  return value ?? null;
}

/** The draft equals the saved value (key order, `undefined` and absent alike). */
export const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
