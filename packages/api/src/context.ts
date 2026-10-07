import type { Actor } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";
import type { Context } from "hono";

/** Resolves who is calling: a session cookie, an API key, … Returns undefined for anonymous. */
export type ActorResolver = (c: Context) => Promise<Actor | undefined>;

export interface ApiDeps {
  readonly store: SiteGraphStore;
  /** Auth is pluggable; when absent, every request is anonymous (tests, local scripts). */
  readonly resolveActor?: ActorResolver;
  /** Extra fetch handler mounted at `/api/auth/*` (Better Auth). */
  readonly authHandler?: (request: Request) => Promise<Response>;
  /** When true (default), mutating routes require an actor. */
  readonly requireAuth?: boolean;
}

export type Env = { Variables: { actor: Actor | undefined; store: SiteGraphStore } };
