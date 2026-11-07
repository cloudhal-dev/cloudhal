/**
 * RFC-0042 §7 over MCP: `list_collections` shows list fields with their operators and the preset's
 * paths; `update_collection` takes `listFields`, `expiry` and `structuredData`, refuses bad ones in
 * precheck (paths and hints, before a person is asked) and describes them readably in its approval;
 * `list_entries` filters, sorts and pages by list fields; `create_page`/`update_page` check a
 * `contentList` query in precheck; `preview_structured_data` shows an entry's JSON-LD and issues.
 */
import { type AgentMode, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type {
  CollectionSettings,
  ContentEntry,
  FieldDefinition,
  Page,
  Site,
} from "@cloudhal/core-contracts";
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_listings1", name: "Organiser" };
const person = { kind: "human" as const, id: "user_listings01", name: "Halil" };
const tools = defineTools();
const byName = (n: string) => tools.find((t) => t.name === n) as (typeof tools)[number];
const policy = new PolicyEngine(toolPolicies(tools));
const L = (label: string) => ({ en: { label } });
/** 5 November 2026, 12:00 UTC. */
const T = Date.UTC(2026, 10, 5, 12, 0, 0);
const HOUR = 3_600_000;
const at = (ms: number) => ({ at: new Date(ms).toISOString(), timeZone: "Europe/Istanbul" });

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "startsAt", type: "datetime", labels: L("Starts at"), localized: false },
  { key: "endsAt", type: "datetime", labels: L("Ends at"), localized: false },
  { key: "venue", type: "text", labels: L("Venue"), localized: false },
  { key: "city", type: "text", labels: L("City"), localized: false },
  { key: "price", type: "number", labels: L("Price"), localized: false },
  {
    key: "state",
    type: "select",
    labels: L("State"),
    localized: false,
    options: [
      { value: "scheduled", labels: { en: "Scheduled" } },
      { value: "cancelled", labels: { en: "Cancelled" } },
      { value: "sold-out", labels: { en: "Sold out" } },
    ],
  },
];

const PRESET = {
  type: "Event",
  properties: {
    startDate: { kind: "field", field: "startsAt" },
    endDate: { kind: "field", field: "endsAt" },
    "location.name": { kind: "field", field: "venue" },
    "location.address.addressLocality": { kind: "field", field: "city" },
    eventStatus: { kind: "field", field: "state" },
    "offers.price": { kind: "field", field: "price" },
    "offers.priceCurrency": { kind: "constant", value: "TRY" },
  },
} as const;

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  site: Site;
  gates: { on: boolean };
  /** The seeded post's terms: a published entry needs a primary category. */
  terms: ContentEntry["terms"];
}

async function world(events: CollectionSettings = {}): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const gates = { on: true };
  const store = new SiteGraphStore({
    sql,
    blobs: new MemoryBlobStore(),
    gates: { enforced: () => gates.on },
  });
  await store.init();
  const seeded = await seedStarterSite(store, { name: "Events", slug: "events" });
  const site = await store.updateSite({
    ...seeded,
    timeZone: "Europe/Istanbul",
    collections: {
      ...seeded.collections,
      events: {
        labels: { en: { singular: "Event", plural: "Events" } },
        fields: FIELDS,
        ...events,
      },
    },
  });
  const [hello] = await store.listContentEntries(site.id, "posts");
  return { store, audit: new AuditLog(sql), site, gates, terms: hello?.terms };
}

function call(w: World, name: string, mode: AgentMode = "edits") {
  const ctx: ToolContext = {
    store: w.store,
    now: () => new Date(T),
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

function event(w: World, title: string, fields: Record<string, unknown>, status = "published") {
  return w.store.createContentEntry({
    siteId: w.site.id,
    collection: "events",
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    locale: "en",
    status,
    title,
    summary: `About ${title}`,
    body: { format: "markdown", value: `All about ${title}.` },
    fields,
    tags: [],
    ...(w.terms ? { terms: w.terms } : {}),
    author: person,
  } as never) as Promise<ContentEntry>;
}

const LISTED = { listFields: ["startsAt", "state", "price"] } as CollectionSettings;

describe("listings, expiry and structured data over MCP (RFC-0042 §7)", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("list_collections shows list fields with their operators and the preset's paths", async () => {
    w = await world({ ...LISTED, structuredData: PRESET } as CollectionSettings);
    const r = await call(w, "list_collections")({});
    const list = (r.result as { collections: Record<string, unknown>[] }).collections;
    const events = list.find((c) => c.key === "events") as Record<string, unknown>;
    expect(events.listFields).toEqual([
      {
        key: "startsAt",
        type: "datetime",
        ops: ["eq", "ne", "lt", "lte", "gt", "gte", "set", "unset"],
        sortable: true,
      },
      { key: "state", type: "select", ops: ["eq", "ne", "in", "set", "unset"], sortable: false },
      {
        key: "price",
        type: "number",
        ops: ["eq", "ne", "lt", "lte", "gt", "gte", "set", "unset"],
        sortable: true,
      },
    ]);
    const sd = events.structuredData as {
      type: string;
      paths: { path: string; required?: true; default?: unknown; vocabulary?: string[] }[];
      warnings: { message: string }[];
    };
    expect(sd.type).toBe("Event");
    const startDate = sd.paths.find((p) => p.path === "startDate");
    expect(startDate?.required).toBe(true);
    expect(sd.paths.find((p) => p.path === "name")?.default).toEqual({
      kind: "entry",
      property: "title",
    });
    expect(sd.paths.find((p) => p.path === "eventStatus")?.vocabulary).toContain("cancelled");
    expect(sd.warnings.map((i) => i.message)).toEqual([
      'option "sold-out" emits nothing for eventStatus',
    ]);
    const posts = list.find((c) => c.key === "posts") as Record<string, unknown>;
    expect(posts.listFields).toBeUndefined();
    expect(posts.structuredData).toBeUndefined();
  });

  it("update_collection refuses bad settings in precheck with paths and hints", async () => {
    const unlisted = await rejection(
      call(w, "update_collection")({ collection: "events", listFields: ["startsAt", "nope"] }),
    );
    expect(unlisted.code).toBe("unknown_field");
    expect(paths(unlisted)).toEqual(["collections/events/listFields/1"]);

    const expiry = await rejection(
      call(
        w,
        "update_collection",
      )({
        collection: "events",
        expiry: { field: "venue", action: "unlist" },
      }),
    );
    expect(expiry.code).toBe("invalid_expiry");
    expect(paths(expiry)).toEqual(["collections/events/expiry/field"]);
    expect(expiry.message).toContain("date or datetime field");

    const preset = await rejection(
      call(
        w,
        "update_collection",
      )({
        collection: "events",
        structuredData: {
          type: "Event",
          properties: {
            startDate: { kind: "field", field: "venue" },
            "location.name": { kind: "constant", value: "Hall" },
          },
        },
      }),
    );
    expect(preset.code).toBe("structured_data_invalid");
    expect(paths(preset)).toEqual(
      expect.arrayContaining([
        "collections/events/structuredData/properties/startDate/field",
        "collections/events/structuredData/properties/location.name/value",
        "collections/events/structuredData/properties/location.address",
      ]),
    );
    expect(preset.message).toContain("structuredData.paths");

    w.gates.on = false;
    const gates = await rejection(
      call(
        w,
        "update_collection",
      )({
        collection: "events",
        expiry: { field: "endsAt", action: "unlist" },
      }),
    );
    expect(gates.code).toBe("gates_unsupported");
    expect(gates.message).toContain("cloudhal deploy");
    expect(gates.message).toContain("leave expiry out");
    // Refused before anyone was asked: nothing waits and nothing changed.
    expect((await w.store.getSite(w.site.id))?.collections?.events?.expiry).toBeUndefined();
  });

  it("update_collection's approval describes the changes in words", async () => {
    await event(w, "Past gig", { startsAt: at(T - 3 * HOUR), endsAt: at(T - HOUR) });
    await event(w, "Next gig", { startsAt: at(T + HOUR), endsAt: at(T + 3 * HOUR) });
    await event(w, "Old draft", { endsAt: at(T - 5 * HOUR) }, "draft");
    const args = {
      collection: "events",
      ...LISTED,
      expiry: { field: "endsAt", action: "unlist", afterMinutes: 60 },
      structuredData: PRESET,
    };
    for (const mode of ["edits", "auto", "bypass"] as AgentMode[]) {
      const ask = await call(w, "update_collection", mode)(args);
      expect(ask.decision.kind, mode).toBe("approval-required");
      const prompt = ask.approvalPrompt as string;
      expect(prompt).toContain(
        'list fields: "Starts at" (startsAt), "State" (state), "Price" (price)',
      );
      // Past gig ended an hour ago: the grace of an hour ends now.
      expect(prompt).toContain(
        'expiry: Events leave listings, feeds, the sitemap and search (their pages stay) 1 hour after "Ends at" (endsAt); 1 published entry is already past it',
      );
      expect(prompt).toContain("structured data: Event, maps startDate ← field startsAt");
      expect(prompt).toContain('offers.priceCurrency ← "TRY"');
      expect(prompt).toContain('structured data warning: option "sold-out" emits nothing');
    }
    const done = await call(w, "update_collection")(args, true);
    const saved = (done.result as { site: Site; warnings: unknown[] }).site.collections?.events;
    expect(saved?.listFields).toEqual(["startsAt", "state", "price"]);
    expect(saved?.expiry?.afterMinutes).toBe(60);
    expect(saved?.structuredData?.type).toBe("Event");
    expect((done.result as { warnings: unknown[] }).warnings).toHaveLength(1);

    const hide = await call(
      w,
      "update_collection",
    )({
      collection: "events",
      expiry: { field: "endsAt", action: "hide" },
      structuredData: null,
    });
    expect(hide.approvalPrompt).toContain(
      'expiry: Events disappear from the site (404 on every route) at "Ends at" (endsAt); 1 published entry is already past it',
    );
    expect(hide.approvalPrompt).toContain(
      "structured data: removed; entry pages go back to BlogPosting",
    );
    expect(hide.approvalPrompt).not.toContain("list fields");
    const removed = await call(w, "update_collection")(
      { collection: "events", expiry: null, structuredData: null, listFields: null },
      true,
    );
    const after = (removed.result as { site: Site }).site.collections?.events;
    expect(after?.expiry).toBeUndefined();
    expect(after?.structuredData).toBeUndefined();
    expect(after?.listFields).toBeUndefined();
  });

  it("refuses to unlist a field contentList sections still use (list_field_in_use)", async () => {
    w = await world(LISTED);
    const home = (await w.store.listPages(w.site.id)).find((p) => p.path === "/") as Page;
    const section = {
      id: "sec_upcoming0001",
      kind: "contentList",
      collection: "events",
      limit: 10,
      sort: "newest",
      where: [{ field: "startsAt", op: "gte", value: "now" }],
    };
    await call(w, "update_page")(
      { pageId: home.id, rev: home.rev, sections: [...home.sections, section] },
      true,
    );
    const r = await rejection(
      call(w, "update_collection")({ collection: "events", listFields: ["price"] }),
    );
    expect(r.code).toBe("list_field_in_use");
    expect(r.message).toContain("update_page");
    expect((r.details.pages as { path: string }[]).map((p) => p.path)).toEqual(["/"]);
  });

  it("create_page and update_page check contentList queries in precheck", async () => {
    w = await world(LISTED);
    const sections = [
      {
        id: "sec_upcoming0001",
        kind: "contentList",
        collection: "events",
        limit: 10,
        sort: "newest",
        where: [
          { field: "venue", op: "eq", value: "Hall" },
          { field: "startsAt", op: "gte", value: "tomorrow" },
        ],
        orderBy: { field: "state", direction: "asc" },
      },
    ];
    const created = await rejection(
      call(w, "create_page")({ path: "/events", title: "Events", sections }),
    );
    expect(created.code).toBe("invalid_query");
    expect(paths(created)).toEqual([
      "sections/0/where/0/field",
      "sections/0/where/1/value",
      "sections/0/orderBy/field",
    ]);
    expect(created.message).toContain("listFields[].ops");
    expect((await w.store.listPages(w.site.id)).some((p) => p.path === "/events")).toBe(false);

    const ok = await call(
      w,
      "create_page",
    )({
      path: "/events",
      title: "Events",
      sections: [
        {
          ...sections[0],
          where: [{ field: "startsAt", op: "gte", value: "now" }],
          orderBy: { field: "startsAt", direction: "asc" },
        },
      ],
    });
    const page = (ok.result as { page: Page }).page;
    const updated = await rejection(
      call(w, "update_page")({ pageId: page.id, rev: page.rev, sections }),
    );
    expect(updated.code).toBe("invalid_query");
    expect(paths(updated)[0]).toBe("sections/0/where/0/field");
  });

  it("list_entries filters, sorts and pages by list fields", async () => {
    w = await world(LISTED);
    await event(w, "Past gig", { startsAt: at(T - 3 * HOUR), state: "scheduled", price: 10 });
    await event(w, "Later gig", { startsAt: at(T + 48 * HOUR), state: "cancelled", price: 30 });
    await event(w, "Soon gig", { startsAt: at(T + 2 * HOUR), state: "scheduled", price: 20 });
    await event(w, "Undated gig", { state: "scheduled" });
    const list = call(w, "list_entries");
    const titles = (r: { result?: unknown }) =>
      (r.result as { entries: ContentEntry[] }).entries.map((e) => e.title);

    const upcoming = await list({
      collection: "events",
      where: [{ field: "startsAt", op: "gte", value: "now" }],
      orderBy: { field: "startsAt", direction: "asc" },
    });
    expect(titles(upcoming)).toEqual(["Soon gig", "Later gig"]);

    const cheap = await list({
      collection: "events",
      where: [
        { field: "state", op: "in", values: ["scheduled"] },
        { field: "price", op: "lt", value: "25" },
      ],
      orderBy: { field: "price", direction: "desc" },
    });
    expect(titles(cheap)).toEqual(["Soon gig", "Past gig"]);

    const first = await list({
      collection: "events",
      orderBy: { field: "startsAt", direction: "desc" },
      limit: 2,
    });
    const page1 = first.result as { entries: ContentEntry[]; total: number; nextCursor: string };
    expect(titles(first)).toEqual(["Later gig", "Soon gig"]);
    expect(page1.total).toBe(4);
    const second = await list({
      collection: "events",
      orderBy: { field: "startsAt", direction: "desc" },
      limit: 2,
      cursor: page1.nextCursor,
    });
    // Entries without a value sort last.
    expect(titles(second)).toEqual(["Past gig", "Undated gig"]);
    expect((second.result as { nextCursor?: string }).nextCursor).toBeUndefined();

    // Without a field query the answer stays the plain list.
    const plain = await list({ collection: "events" });
    expect(plain.result).toEqual({ entries: expect.any(Array) });
    expect(titles(plain)).toHaveLength(4);

    const bad = await rejection(
      list({
        collection: "events",
        where: [{ field: "venue", op: "eq", value: "x" }],
        orderBy: { field: "state", direction: "asc" },
      }),
    );
    expect(bad.code).toBe("invalid_query");
    expect(paths(bad)).toEqual(["where/0/field", "orderBy/field"]);
    expect(bad.message).toContain("list_collections");
    const cursor = await rejection(list({ collection: "events", limit: 2, cursor: "zzz" }));
    expect(paths(cursor)).toEqual(["cursor"]);
    // List fields belong to one collection: without it they are refused, not ignored.
    const noCollection = await rejection(
      list({ orderBy: { field: "startsAt", direction: "asc" } }),
    );
    expect(paths(noCollection)).toEqual(["collection"]);
  });

  it("list_entries without a collection lists every collection, not only posts", async () => {
    w = await world(LISTED);
    await event(w, "Soon gig", { startsAt: at(T + 2 * HOUR), state: "scheduled", price: 20 });
    const all = (await call(w, "list_entries")({})).result as { entries: ContentEntry[] };
    expect(new Set(all.entries.map((e) => e.collection))).toEqual(new Set(["posts", "events"]));
    const posts = (await call(w, "list_entries")({ collection: "posts" })).result as {
      entries: ContentEntry[];
    };
    expect(posts.entries.every((e) => e.collection === "posts")).toBe(true);
    expect(posts.entries.length).toBe(all.entries.length - 1);
  });

  it("preview_structured_data returns the entry's JSON-LD and its issues", async () => {
    w = await world({ structuredData: PRESET } as CollectionSettings);
    const full = await event(
      w,
      "Soon gig",
      {
        startsAt: at(T + 2 * HOUR),
        endsAt: at(T + 4 * HOUR),
        venue: "Moda Stage",
        city: "Istanbul",
        state: "cancelled",
        price: 250,
      },
      "draft",
    );
    const r = await call(w, "preview_structured_data")({ entryId: full.id });
    const out = r.result as {
      preset: string;
      origin: string;
      document: Record<string, unknown>;
      issues: { code: string; message: string; warning?: true }[];
    };
    expect(out.preset).toBe("Event");
    expect(out.document).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Soon gig",
      startDate: "2026-11-05T17:00:00+03:00",
      eventStatus: "https://schema.org/EventCancelled",
      location: {
        "@type": "Place",
        name: "Moda Stage",
        address: { "@type": "PostalAddress", addressLocality: "Istanbul" },
      },
      offers: { "@type": "Offer", price: 250, priceCurrency: "TRY" },
    });
    expect(out.issues).toEqual([expect.objectContaining({ code: "vocabulary", warning: true })]);

    const partial = await event(w, "No date", { venue: "Hall", city: "Izmir" }, "draft");
    const missing = await call(w, "preview_structured_data")({ entryId: partial.id });
    const m = missing.result as { document: unknown; issues: { path: string; message: string }[] };
    expect(m.document).toBeNull();
    expect(m.issues[0]).toMatchObject({
      path: "startDate",
      message: "Structured data: startDate missing",
    });

    const post = (await w.store.listContentEntries(w.site.id, "posts"))[0] as ContentEntry;
    const none = await call(w, "preview_structured_data")({ entryId: post.id });
    expect(none.result).toMatchObject({ preset: null, document: null });
    expect((none.result as { issues: { code: string }[] }).issues[0]?.code).toBe("no_preset");

    // Read-only: content:read is enough, and it never waits for anyone.
    const tool = byName("preview_structured_data");
    expect(tool.scopes).toEqual(["content:read"]);
    expect(tool.annotations.readOnlyHint).toBe(true);
    const planned = await call(w, "preview_structured_data", "plan")({ entryId: full.id });
    expect(planned.decision.kind).toBe("allow");
  });
});
