/** The self-hosted static site's rebuild on publish (#150, `packages/api` `routes/site-build.ts`). */
import { request } from "./http.ts";

/** The last build: when, whether it worked, what it rendered and why it failed. */
export interface SiteBuildLast {
  at: string;
  ok: boolean;
  durationMs?: number;
  snapshotId?: string;
  /** `published`: the site; `not-published`: the status page (nothing is published yet). */
  state?: "published" | "not-published";
  trigger?: string;
  /** The build's last output lines, when it failed. */
  error?: string;
}

export type SiteBuildStatus =
  | { enabled: false }
  | { enabled: true; state: "idle" | "queued" | "running"; last: SiteBuildLast | null };

export const siteBuildApi = {
  status: (siteId: string) => request<SiteBuildStatus>(`/api/sites/${siteId}/site-build`),
};
