/**
 * Mounts `/api/admin` behind the deploy token. A deploy token shorter than 32 characters (an owner
 * who edited CLOUDHAL_DEPLOY_TOKEN instead of CLOUDHAL_SETUP_TOKEN) switches off only the admin
 * routes: the rest of the API, sign-in included, keeps working and `/api/health` names the problem.
 */
import type { Hono } from "hono";
import type { ApiDeps, Env } from "../context.ts";
import { adminRoutes } from "./admin.ts";

export const MIN_DEPLOY_TOKEN_LENGTH = 32;

/** Health problems the admin mount found; empty when the admin routes are served or not wanted. */
export type AdminProblem = "deploy_token_invalid";

export function mountAdmin(app: Hono<Env>, deps: ApiDeps): AdminProblem[] {
  if (!deps.admin) return [];
  const { deployToken, storage } = deps.admin;
  if (deployToken.length >= MIN_DEPLOY_TOKEN_LENGTH) {
    app.route(
      "/api/admin",
      adminRoutes(deployToken, storage, deps.ai?.transport, deps.mcp?.render),
    );
    return [];
  }
  console.error(
    `cloudhal: CLOUDHAL_DEPLOY_TOKEN is shorter than ${MIN_DEPLOY_TOKEN_LENGTH} characters; /api/admin is disabled ` +
      "(push, pull, owner transfer). Do not edit CLOUDHAL_DEPLOY_TOKEN; deploy again to set it " +
      "(Workers Builds: retry the build). The owner setup token is CLOUDHAL_SETUP_TOKEN.",
  );
  app.all("/api/admin/*", (c) =>
    c.json(
      {
        error: "deploy_token_invalid",
        message: `CLOUDHAL_DEPLOY_TOKEN must be at least ${MIN_DEPLOY_TOKEN_LENGTH} characters; admin endpoints are disabled`,
      },
      503,
    ),
  );
  return ["deploy_token_invalid"];
}
