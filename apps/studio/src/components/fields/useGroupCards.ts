import { FIELD_LIMITS } from "@cloudhal/core-ts/fields";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { type ReferenceCard, referencesApi } from "../../lib/api/references.ts";

/**
 * The members of every group the form names (RFC-0045 §5), any status, from `GET
 * …/entries/groups` (100 ids a request), and the picker's cards for targets chosen since, so a new
 * target shows before the answer. A group with no member left maps to `[]` ("Not found").
 */
export function useGroupCards(siteId: string, ids: readonly string[]) {
  const [picked, setPicked] = useState<ReadonlyMap<string, ReferenceCard[]>>(new Map());
  const wanted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const query = useQuery({
    queryKey: ["entry-groups", siteId, wanted.join(",")],
    queryFn: async () => {
      const out: Record<string, ReferenceCard[]> = {};
      for (let i = 0; i < wanted.length; i += FIELD_LIMITS.referencesPerEntry) {
        const page = await referencesApi.groups(
          siteId,
          wanted.slice(i, i + FIELD_LIMITS.referencesPerEntry),
        );
        Object.assign(out, page.groups);
      }
      return out;
    },
    enabled: wanted.length > 0,
    placeholderData: keepPreviousData,
  });
  const cards = useMemo(() => {
    const out = new Map<string, readonly ReferenceCard[]>(picked);
    for (const [id, members] of Object.entries(query.data ?? {})) out.set(id, members);
    return out;
  }, [picked, query.data]);
  const add = useCallback(
    (more: readonly ReferenceCard[]) =>
      setPicked((was) => {
        const next = new Map(was);
        for (const card of more) next.set(card.groupId, [card]);
        return next;
      }),
    [],
  );
  return { cards, add };
}
