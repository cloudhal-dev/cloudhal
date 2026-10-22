/**
 * `approverScopes` (RFC-0038 §5): an agent with `site:write` may ask to move a collection's URLs,
 * but only a person who could change site settings in Studio decides it. `canDecide` is called
 * directly with the context values it reads.
 */
import {
  type Approval,
  PolicyEngine,
  type Role,
  roleScopes,
  type ToolPolicy,
} from "@cloudhal/agent-runtime";
import type { Context } from "hono";
import { describe, expect, it } from "vitest";
import type { Env } from "../src/context.ts";
import { canDecide } from "../src/routes/approvals.ts";

const TOOL: ToolPolicy = {
  name: "set_collection_permalink",
  scopes: ["site:write"],
  annotations: { readOnlyHint: false, destructiveHint: false },
  requiresApproval: true,
  approverScopes: ["site:settings"],
};

const request: Approval = {
  id: "appr_test",
  siteId: "site_one",
  tool: TOOL.name,
  input: { siteId: "site_one", collection: "posts", permalink: "/blog/{slug}" },
  actor: { kind: "agent", id: "agent_bot", name: "bot" },
  prompt: "Move the public URLs of posts",
  stateHash: "0".repeat(64),
  status: "pending",
  createdAt: "2026-10-22T00:00:00.000Z",
  expiresAt: "2026-10-23T00:00:00.000Z",
};

function as(role: Role): Context<Env> {
  const values: Record<string, unknown> = {
    principal: {
      actor: { kind: "human", id: `user_${role}`, name: role },
      scopes: roleScopes(role),
      person: { id: `user_${role}`, userId: role, role },
    },
    staff: {},
    policy: () => new PolicyEngine([TOOL]),
    ownership: { personOf: async () => "user_owner" },
  };
  return { get: (key: string) => values[key] } as unknown as Context<Env>;
}

describe("approverScopes: who may approve a call (RFC-0038 §5)", () => {
  it("an Editor holds the tool's scope but may not approve it", async () => {
    expect(await canDecide(as("editor"), request, "approve")).toMatchObject({
      ok: false,
      code: "missing_scope",
    });
  });

  it("an Administrator, who may change site settings, may", async () => {
    expect(await canDecide(as("administrator"), request, "approve")).toEqual({ ok: true });
  });
});
