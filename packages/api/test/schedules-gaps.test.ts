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

describe("Site.timeZone is validated on write (note 15)", () => {
  it("PUT /api/sites/:id answers 400 invalid_time_zone for a zone the runtime does not know", async () => {
    const s = await setup({ gates: GATES_ENFORCED });
    const bad = await s.call(`/api/sites/${s.site.id}`, "PUT", {
      ...s.site,
      timeZone: "Europe/Atlantis",
    });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({
      error: "invalid_time_zone",
      details: { timeZone: "Europe/Atlantis" },
    });
    // the shape is the schema's (`+03:00` is not a zone name): a validation error, also 400
    expect(
      (await s.call(`/api/sites/${s.site.id}`, "PUT", { ...s.site, timeZone: "+03:00" })).status,
    ).toBe(400);
    const ok = await s.call(`/api/sites/${s.site.id}`, "PUT", {
      ...s.site,
      timeZone: "Europe/Istanbul",
    });
    expect(ok.status).toBe(200);
    expect(ok.body.timeZone).toBe("Europe/Istanbul");
  });
});

describe("an agent task's modeCap applies per call (note 18)", () => {
  const task = {
    name: "Nightly drafts",
    job: { kind: "agent-task", instructions: "Draft the digest.", modeCap: "edits" },
    recurrence: { start: "2026-10-12T02:07", rule: "FREQ=DAILY;BYHOUR=2;BYMINUTE=7" },
  };

  it("the key is minted at the owner's cap, not at modeCap; a raise and a lower are accepted", async () => {
    const s = await setup({ gates: GATES_ENFORCED });
    const created = await s.call(`/api/sites/${s.site.id}/automations`, "POST", task, "editor");
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    expect(s.minted[0]?.mode).toBe("auto");
    let a = created.body.automation as { id: string; rev: number };
    const patch = (modeCap: string) =>
      s.call(
        `/api/sites/${s.site.id}/automations/${a.id}`,
        "PATCH",
        { rev: a.rev, job: { modeCap } },
        "editor",
      );
    const raised = await patch("auto");
    expect(raised.status, JSON.stringify(raised.body)).toBe(200);
    expect(raised.body.automation).toMatchObject({ job: { modeCap: "auto" } });
    a = raised.body.automation as typeof a;
    const lowered = await patch("plan");
    expect(lowered.status).toBe(200);
    expect(lowered.body.automation).toMatchObject({ job: { modeCap: "plan" } });
    a = lowered.body.automation as typeof a;
    expect((await patch("bypass")).status).toBe(400);
  });

  it("a raise above the key's own mode is refused with what to do; a lower still works", async () => {
    // a key minted before this fix (its mode was the old cap), or lowered on the Agents page
    const s = await setup({ gates: GATES_ENFORCED, keyMode: "edits" });
    const created = await s.call(`/api/sites/${s.site.id}/automations`, "POST", task, "editor");
    let a = created.body.automation as { id: string; rev: number };
    const patch = (modeCap: string) =>
      s.call(
        `/api/sites/${s.site.id}/automations/${a.id}`,
        "PATCH",
        { rev: a.rev, job: { modeCap } },
        "editor",
      );
    const refused = await patch("auto");
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({
      error: "mode_cap_above_key",
      details: { keyMode: "edits", modeCap: "auto" },
    });
    const lowered = await patch("manual");
    expect(lowered.status).toBe(200);
    a = lowered.body.automation as typeof a;
    // back up to the key's own mode is fine
    expect((await patch("edits")).status).toBe(200);
  });
});
