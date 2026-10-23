/**
 * RFC-0041 §8 over MCP: `list_collections` shows field definitions and their JSON Schema;
 * `create_entry` / `update_entry` refuse invalid values in precheck with their paths (before a
 * person is asked), `update_entry` takes a merge patch and names typed changes in its approval;
 * `update_collection` takes free definition edits and refuses risky ones naming the operation tool;
 * the four operation tools wait for a person holding `site:settings` in every mode, show the dry
 * run, run after approval, and continue an unfinished operation only with a new approval.
 */
import { type AgentMode, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type { ContentEntry, FieldDefinition, Site, Translation } from "@cloudhal/core-contracts";
import { runFieldOperation, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_fields01", name: "Organiser" };
const person = { kind: "human" as const, id: "user_fields01", name: "Halil" };
const tools = defineTools();
const byName = (n: string) => tools.find((t) => t.name === n) as (typeof tools)[number];
const policy = new PolicyEngine(toolPolicies(tools));
const L = (label: string, help?: string) => ({ en: { label, ...(help ? { help } : {}) } });
const OPERATIONS = ["rename_field", "change_field_type", "set_field_localized", "remove_field"];

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "speaker", type: "text", labels: L("Speaker", "Who talks"), localized: true },
  {
    key: "startsAt",
    type: "datetime",
    labels: L("Starts at"),
    localized: false,
    requiredToPublish: true,
  },
  { key: "day", type: "date", labels: L("Day"), localized: false },
  {
    key: "format",
    type: "select",
    labels: L("Format"),
    localized: false,
    multiple: true,
    options: [
      { value: "talk", labels: { en: "Talk", tr: "Konuşma" } },
      { value: "workshop", labels: { en: "Workshop" } },
    ],
  },
  { key: "seats", type: "text", labels: L("Seats"), localized: false },
  { key: "poster", type: "image", labels: L("Poster"), localized: false },
];

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  site: Site;
}

async function world(): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({ sql, blobs: new MemoryBlobStore() });
  const seeded = await seedStarterSite(store, { name: "Events", slug: "events" });
  const site = await store.updateSite({
    ...seeded,
    locales: ["en", "tr"],
    timeZone: "Europe/Istanbul",
    collections: {
      events: { labels: { en: { singular: "Event", plural: "Events" } }, fields: FIELDS },
    },
  });
  return { store, audit: new AuditLog(sql), site };
}

function call(w: World, name: string, mode: AgentMode = "edits") {
  const ctx: ToolContext = {
    store: w.store,
    principal: { actor: agent, scopes: ["*"], mode, ...(mode === "bypass" ? { local: true } : {}) },
  };
  return (args: Record<string, unknown>, confirmed = false) =>
    runTool(byName(name), { siteId: w.site.id, ...args }, ctx, {
      policy,
      audit: w.audit,
      confirmed,
    });
}

async function rejection(
  p: Promise<unknown>,
): Promise<{ code: string; message: string; details: Record<string, unknown> }> {
  try {
    await p;
  } catch (e) {
    return e as { code: string; message: string; details: Record<string, unknown> };
  }
  throw new Error("expected a rejection");
}

const paths = (e: { details: Record<string, unknown> }) =>
  (e.details.issues as { path: string }[]).map((i) => i.path);

function event(w: World, fields: Record<string, unknown>, extra: Partial<ContentEntry> = {}) {
  return w.store.createContentEntry({
    siteId: w.site.id,
    collection: "events",
    slug: `e-${Math.random().toString(36).slice(2, 8)}`,
    locale: "en",
    status: "draft",
    title: "Launch",
    body: { format: "markdown", value: "Body" },
    fields,
    tags: [],
    author: person,
    ...extra,
  } as never) as Promise<ContentEntry>;
}

describe("typed custom fields over MCP (RFC-0041 §8)", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("list_collections returns the definitions and the fields schema in the asked locale", async () => {
    const r = await call(w, "list_collections")({ locale: "tr" });
    const list = (r.result as { collections: Record<string, unknown>[] }).collections;
    const events = list.find((c) => c.key === "events") as Record<string, unknown>;
    expect(events.fields).toEqual(FIELDS);
    const schema = events.fieldsSchema as {
      properties: Record<string, { title?: string; description?: string; items?: unknown }>;
      additionalProperties: boolean;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.speaker?.title).toBe("Speaker");
    expect(schema.properties.speaker?.description).toContain("Who talks");
    expect(schema.properties.format?.description).toContain("talk (Konuşma)");
    expect(schema.properties.seats?.description).toContain("Set on the original only");
    expect(schema.properties.startsAt?.description).toContain("Needed to publish");
    // Collections without definitions carry neither.
    const posts = list.find((c) => c.key === "posts") as Record<string, unknown>;
    expect(posts.fields).toBeUndefined();
    expect(posts.fieldsSchema).toBeUndefined();
  });

  it("create_entry refuses invalid values in precheck, each at its path", async () => {
    const bad = await rejection(
      call(
        w,
        "create_entry",
        "manual",
      )({
        collection: "events",
        slug: "launch",
        title: "Launch",
        body: "Soon.",
        fields: { day: "2026-02-30", format: ["talk", "talk"], poster: "asset_missing01" },
      }),
    );
    expect(bad.code).toBe("invalid_fields");
    expect(paths(bad)).toEqual(
      expect.arrayContaining(["fields/day", "fields/format", "fields/poster"]),
    );
    expect(bad.message).toContain("list_collections");
    const unknown = await rejection(
      call(
        w,
        "create_entry",
      )({
        collection: "events",
        slug: "launch",
        title: "Launch",
        body: "Soon.",
        fields: { venue: "Hall" },
      }),
    );
    expect(unknown.code).toBe("unknown_field");
    expect(paths(unknown)).toEqual(["fields/venue"]);
    // Refused before anyone is asked: the audit row is a denial.
    const rows = await w.audit.list({ siteId: w.site.id });
    expect(rows.every((row) => row.decision === "deny")).toBe(true);
    const ok = await call(
      w,
      "create_entry",
    )({
      collection: "events",
      slug: "launch",
      title: "Launch",
      body: "Soon.",
      fields: { speaker: "Ada", day: "2026-11-05" },
    });
    expect((ok.result as { entry: ContentEntry }).entry.fields).toEqual({
      speaker: "Ada",
      day: "2026-11-05",
    });
  });

  it("update_entry merges fields (null removes), and checks requiredToPublish and translations", async () => {
    const e = await event(w, { speaker: "Ada", seats: "120" });
    const r = await call(
      w,
      "update_entry",
    )({
      entryId: e.id,
      rev: e.rev,
      fields: { seats: null, day: "2026-11-05" },
    });
    const saved = (r.result as { entry: ContentEntry }).entry;
    expect(saved.fields).toEqual({ speaker: "Ada", day: "2026-11-05" });

    const publish = await rejection(
      call(w, "update_entry")({ entryId: e.id, rev: saved.rev, status: "review" }),
    );
    expect(publish.code).toBe("required_field");
    expect(paths(publish)).toEqual(["fields/startsAt"]);

    const group = (await w.store.translationGroup(w.site, e.id)).members[0];
    const tr = await event(
      w,
      { speaker: "Ada TR" },
      {
        locale: "tr",
        slug: e.slug,
        translation: {
          group: e.id,
          method: "human",
          source: { id: e.id, locale: "en", rev: saved.rev, hash: group?.hash as string },
        } as Translation,
      },
    );
    const shared = await rejection(
      call(w, "update_entry")({ entryId: tr.id, rev: tr.rev, fields: { day: "2027-01-01" } }),
    );
    expect(shared.code).toBe("field_not_localized");
    expect(shared.message).toContain(e.id);
  });

  it("update_entry's approval names typed changes readably", async () => {
    const e = await event(w, { speaker: "Ada", seats: "120" });
    const r = await call(
      w,
      "update_entry",
      "manual",
    )({
      entryId: e.id,
      rev: e.rev,
      fields: {
        startsAt: { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" },
        format: ["talk", "workshop"],
        day: "2026-11-05",
        seats: null,
        speaker: "x".repeat(200),
      },
    });
    expect(r.decision.kind).toBe("approval-required");
    const prompt = r.approvalPrompt as string;
    expect(prompt).toContain('"Starts at" (startsAt) → 5 Nov 2026 19:30 Istanbul');
    expect(prompt).toContain('"Format" (format) → Talk, Workshop');
    expect(prompt).toContain('"Day" (day) → 5 Nov 2026');
    expect(prompt).toContain('"Seats" (seats) removed');
    expect(prompt).toContain("…");
    expect(prompt).not.toContain("x".repeat(80));
  });

  it("update_collection takes free edits and refuses risky ones naming the operation tool", async () => {
    const added = [
      ...FIELDS.map((d) => (d.key === "speaker" ? { ...d, labels: L("Speaker name") } : d)),
      { key: "price", type: "number", labels: L("Price"), localized: false, minimum: 0 },
    ];
    const ask = await call(
      w,
      "update_collection",
      "bypass",
    )({ collection: "events", fields: added });
    expect(ask.decision.kind).toBe("approval-required");
    expect(ask.approvalPrompt).toContain('add "Price" (price), number');
    expect(ask.approvalPrompt).toContain('change "Speaker name" (speaker)');
    const done = await call(w, "update_collection")({ collection: "events", fields: added }, true);
    expect((done.result as { site: Site }).site.collections?.events?.fields?.at(-1)?.key).toBe(
      "price",
    );

    await event(w, { seats: "120" });
    const retyped = added.map((d) => (d.key === "seats" ? { ...d, type: "number" } : d));
    const risky = await rejection(
      call(w, "update_collection")({ collection: "events", fields: retyped }),
    );
    expect(risky.code).toBe("field_change_needs_operation");
    expect(risky.message).toContain("change_field_type");
    const dropped = added.filter((d) => d.key !== "seats");
    const drop = await rejection(
      call(w, "update_collection")({ collection: "events", fields: dropped }),
    );
    expect(drop.code).toBe("field_change_needs_operation");
    expect(drop.message).toContain("remove_field");
  });

  it("operation tools: site:write + content:write, approver site:settings, waits even in bypass", async () => {
    await event(w, { seats: "120" });
    for (const name of OPERATIONS) {
      const tool = byName(name);
      expect(tool.scopes, name).toEqual(["site:write", "content:write"]);
      expect(tool.approverScopes, name).toEqual(["site:settings"]);
      expect(tool.requiresApproval, name).toBe(true);
    }
    expect(byName("remove_field").annotations.destructiveHint).toBe(true);
    expect(byName("change_field_type").annotations.destructiveHint).toBe(true);
    expect(byName("rename_field").annotations.destructiveHint).toBe(false);
    for (const mode of ["edits", "auto", "bypass"] as const) {
      const r = await call(
        w,
        "rename_field",
        mode,
      )({ collection: "events", from: "seats", to: "capacity" });
      expect(r.decision.kind, mode).toBe("approval-required");
      expect(r.approvalPrompt).toContain('Rename the field "Seats" (seats) of events to capacity?');
      expect(r.approvalPrompt).toContain("1 values moved");
      expect(r.approvalPrompt).toContain('"120" → "120"');
      expect(r.approvalPrompt).toContain("entry.fields.seats");
    }
    // A key without content:write is refused.
    const ctx: ToolContext = {
      store: w.store,
      principal: { actor: agent, scopes: ["site:write"], mode: "edits" },
    };
    const denied = await runTool(
      byName("remove_field"),
      { siteId: w.site.id, collection: "events", key: "seats" },
      ctx,
      { policy },
    );
    expect(denied.decision.kind).toBe("deny");
    expect((await w.store.getSite(w.site.id))?.collections?.events?.fields?.length).toBe(6);
  });

  it("dry run reports without asking; the approved run rewrites, snapshots and reports", async () => {
    const e = await event(w, { seats: "120" });
    const dry = await call(
      w,
      "rename_field",
    )({
      collection: "events",
      from: "seats",
      to: "capacity",
      dryRun: true,
    });
    expect(dry.decision.kind).toBe("allow");
    expect(dry.result).toMatchObject({
      dryRun: true,
      done: false,
      report: { moved: 1, touched: 1 },
    });
    expect((await w.store.getContentEntry(e.id))?.fields).toEqual({ seats: "120" });

    const run = await call(w, "rename_field")(
      { collection: "events", from: "seats", to: "capacity" },
      true,
    );
    expect(run.result).toMatchObject({ dryRun: false, done: true, report: { moved: 1 } });
    expect((run.result as { operationId: string }).operationId).toMatch(/^snap_/);
    expect((await w.store.getContentEntry(e.id))?.fields).toEqual({ capacity: "120" });
    const keys = (await w.store.getSite(w.site.id))?.collections?.events?.fields?.map((d) => d.key);
    expect(keys).toContain("capacity");
  });

  it("refusals: unconvertible values never reach a person; unknown fields; running operations", async () => {
    await event(w, { seats: "lots" });
    const ask = call(w, "change_field_type", "bypass");
    const unconvertible = await rejection(
      ask({ collection: "events", key: "seats", type: "number" }),
    );
    expect(unconvertible.code).toBe("field_values_unconvertible");
    expect(unconvertible.message).toContain('onInvalid: "clear"');
    expect(unconvertible.details.report).toBeDefined();
    const clear = await ask({
      collection: "events",
      key: "seats",
      type: "number",
      onInvalid: "clear",
    });
    expect(clear.decision.kind).toBe("approval-required");
    expect(clear.approvalPrompt).toContain("1 cleared");

    const unknown = await rejection(
      call(w, "remove_field")({ collection: "events", key: "venue" }),
    );
    expect(unknown.code).toBe("unknown_field");
  });

  it("an unfinished operation continues only with a new approval", async () => {
    for (let i = 0; i < 3; i++) await event(w, { seats: String(i) });
    const started = await runFieldOperation(
      w.store,
      w.site.id,
      { op: "rename_field", collection: "events", from: "seats", to: "capacity" },
      { actor: agent, budget: { entries: 1 } },
    );
    expect(started.done).toBe(false);
    const args = { collection: "events", from: "seats", to: "capacity" };
    const again = await rejection(call(w, "rename_field")(args));
    expect(again.code).toBe("operation_in_progress");
    expect(again.message).toContain("operationId");

    const resume = { ...args, operationId: started.operationId };
    const status = await call(w, "rename_field")({ ...resume, dryRun: true });
    expect(status.result).toMatchObject({
      dryRun: true,
      done: false,
      status: { state: "running" },
    });
    const ask = await call(w, "rename_field", "bypass")(resume);
    expect(ask.decision.kind).toBe("approval-required");
    expect(ask.approvalPrompt).toContain(`Continue the field operation ${started.operationId}`);
    const wrong = await rejection(
      call(
        w,
        "remove_field",
      )({ collection: "events", key: "seats", operationId: started.operationId }),
    );
    expect(wrong.code).toBe("invalid");

    const done = await call(w, "rename_field")(resume, true);
    expect(done.result).toMatchObject({ done: true, operationId: started.operationId });
    const entries = await w.store.listContentEntries(w.site.id, { collection: "events" });
    expect(entries.every((e) => "capacity" in (e.fields ?? {}))).toBe(true);
  });
});
