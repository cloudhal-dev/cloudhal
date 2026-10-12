/**
 * RFC-0008 implementation notes 14, 15 and 18, over REST: `features.schedules.gates` is the site
 * renderer's answer (the writers' own check), `Site.timeZone` is validated on write
 * (`400 invalid_time_zone`), and an agent task's key no longer bakes in its `modeCap`: it is minted
 * at its owner's cap, a raise or a lower of `modeCap` applies on the next call, and a raise above
 * what the key itself may do is refused (`409 mode_cap_above_key`).
 */
import { type AgentMode, type Principal, type Role, roleScopes } from "@cloudhal/agent-runtime";
import {
  GATES_ENFORCED,
  type GateSupport,
  SiteGraphStore,
  seedStarterSite,
} from "@cloudhal/core-ts";
import { SqlScheduleStore } from "@cloudhal/schedules/sql";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";
import type { AgentKeyService } from "../src/auth.ts";

function person(role: Role): Principal {
  const id = `user_${role.padEnd(12, "0").slice(0, 12)}`;
  return {
    actor: { kind: "human", id, name: role },
    scopes: roleScopes(role),
    person: { id, userId: `u-${role}`, role, name: role },
  };
}

type Json = Record<string, unknown>;

async function setup(o: { gates?: GateSupport; schedules?: boolean; keyMode?: AgentMode } = {}) {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({
    sql,
    blobs: new MemoryBlobStore(),
    ...(o.gates ? { gates: o.gates } : {}),
  });
  await store.init();
  const site = await seedStarterSite(store, { name: "Gaps", slug: "gaps" });
  const minted: { mode?: AgentMode; scopes?: string[] }[] = [];
  const keys = {
    async create(input: { mode?: AgentMode; scopes?: string[] }) {
      minted.push({ ...(input.mode ? { mode: input.mode } : {}), scopes: input.scopes ?? [] });
      return { id: `key_gaps${minted.length}00000`, key: "shown-once", scopes: input.scopes ?? [] };
    },
    // what the key's next call would run in (its own mode, its owner's cap)
    async state() {
      return { enabled: true, creatorRole: "editor", effectiveMode: o.keyMode ?? "auto" };
    },
    async list() {
      return [];
    },
    async delete() {
      return undefined;
    },
  } as unknown as AgentKeyService;
  const app = createApi({
    store,
    ...(o.schedules === false
      ? {}
      : {
          schedules: {
            store: new SqlScheduleStore(sql),
            maxNewBodies: Number.POSITIVE_INFINITY,
          },
        }),
    agentKeys: keys,
    resolvePrincipal: async (c) => {
      const who = c.req.header("x-test-user");
      return who ? person(who as Role) : undefined;
    },
  });
  const call = async (path: string, method = "GET", body?: unknown, who = "owner") => {
    const res = await app.request(path, {
      method,
      headers: { "content-type": "application/json", "x-test-user": who },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, body: (await res.json()) as Json };
  };
  return { store, site, call, minted };
}

const gatesOf = async (s: Awaited<ReturnType<typeof setup>>) =>
  ((await s.call("/api/instance")).body.features as { schedules: { gates: boolean } }).schedules
    .gates;

describe("features.schedules.gates is the renderer's answer (note 14)", () => {
  it("true where the renderer enforces gates (Node), false where it has not confirmed", async () => {
    expect(await gatesOf(await setup({ gates: GATES_ENFORCED }))).toBe(true);
    // an older site Worker (no handshake): writers refuse gates, and the feature says so
    expect(await gatesOf(await setup({ gates: { enforced: () => false } }))).toBe(false);
    expect(await gatesOf(await setup())).toBe(false);
    // no schedules on this server: never true
    expect(await gatesOf(await setup({ gates: GATES_ENFORCED, schedules: false }))).toBe(false);
  });

  it("follows the site Worker's handshake once it confirms (deploying the site Worker is enough)", async () => {
    let confirmed = false;
    const asked: string[] = [];
    const s = await setup({
      gates: {
        enforced: (siteId) => {
          asked.push(siteId);
          return confirmed;
        },
      },
    });
    expect(await gatesOf(s)).toBe(false);
    confirmed = true;
    expect(await gatesOf(s)).toBe(true);
    expect(asked).toEqual([s.site.id, s.site.id]);
  });
});

