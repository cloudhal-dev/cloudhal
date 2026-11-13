import { FIELD_LIMITS, GROUP_ID_PATTERN } from "@cloudhal/core-ts/fields";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { type ReferenceCard, referencesApi } from "../../lib/api/references.ts";

const GROUP_ID = new RegExp(GROUP_ID_PATTERN);

/**
 * The members of every group the form names (RFC-0045 §5), any status, from `GET
 * …/entries/groups` (100 ids a request), and the picker's cards for targets chosen since, so a new
 * target shows before the answer. A group with no member left maps to `[]` ("Not found"), and so
 * does a value that is no group id (text a running conversion has not rewritten yet): it is never
 * sent, so one such value can't fail the read for the others. `failed` and `retry` let the host
 * say when the read itself failed.
 */
export function useGroupCards(siteId: string, ids: readonly string[]) {
  const [picked, setPicked] = useState<ReadonlyMap<string, ReferenceCard[]>>(new Map());
  const unique = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const wanted = useMemo(() => unique.filter((id) => GROUP_ID.test(id)), [unique]);
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
    for (const id of unique) if (!GROUP_ID.test(id)) out.set(id, []);
    for (const [id, members] of Object.entries(query.data ?? {})) out.set(id, members);
    return out;
  }, [picked, query.data, unique]);
  const add = useCallback(
    (more: readonly ReferenceCard[]) =>
      setPicked((was) => {
        const next = new Map(was);
        for (const card of more) next.set(card.groupId, [card]);
        return next;
      }),
    [],
  );
  return {
    cards,
    add,
    failed: query.isError,
    retrying: query.isFetching,
    retry: () => void query.refetch(),
  };
}
