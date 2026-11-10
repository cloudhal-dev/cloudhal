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

/** What visitors see now, from the last build that went live (Studio's, cron's or a hand-run). */
export interface SiteBuildServed {
  at: string;
  snapshotId?: string;
  state?: "published" | "not-published";
  /** `studio`, `cron`, `manual`, `start`. */
  source?: string;
}

export type SiteBuildStatus =
  | { enabled: false }
  | {
      enabled: true;
      state: "idle" | "queued" | "running";
      /** The last build Studio ran (its output only for `audit:read`). */
      last: SiteBuildLast | null;
      /** What is online now; null: nothing; absent: the server cannot tell. */
      served?: SiteBuildServed | null;
    };

export const siteBuildApi = {
  status: (siteId: string) => request<SiteBuildStatus>(`/api/sites/${siteId}/site-build`),
};
