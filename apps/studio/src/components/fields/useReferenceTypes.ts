import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api.ts";

/**
 * RFC-0045: whether the server takes reference and repeater fields (`/api/instance`,
 * `features.referenceFields`): true where the store has the capability (rollout step 7: the admin
 * Worker, Node and the playground). Without it the builder offers neither type, so it looks as
 * before; an older server omits it, which reads as no. The store still decides per site.
 */
export function useReferenceTypes(): boolean {
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  return instance.data?.features.referenceFields === true;
}
