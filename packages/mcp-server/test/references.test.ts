/**
 * RFC-0045 rollout step 5 over MCP: `list_collections`' open and strict schemas with `strictCost`;
 * `fieldsStrict` and `clearFields` on `create_entry` / `update_entry` (the strict round trip and
 * its edge cases); the reference prechecks and approval prompts; `delete_entry`'s refusal;
 * `list_references` both ways; the translation tools' repeater paths; the operation tools' step-4
 * inputs. The types stay refused in production: the store here has `fieldTypes`, and the gate's
 * own cases run on a store without it.
 */
import { type AgentMode, AuditLog, PolicyEngine } from "@cloudhal/agent-runtime";
import type { ContentEntry, FieldDefinition, Site } from "@cloudhal/core-contracts";
import { nodeHash, runFieldOperation, SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore, migrate, migrations } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import type { JsonSchema } from "../src/common.ts";
import { defaultToolList } from "../src/server-schema.ts";
import { defineTools, runTool, type ToolContext, toolPolicies } from "../src/tools.ts";

const agent = { kind: "agent" as const, id: "agent_refs0001", name: "Organiser" };
const person = { kind: "human" as const, id: "user_refs0001", name: "Halil" };
const L = (label: string) => ({ en: { label } });
const names = (singular: string, plural: string) => ({ en: { singular, plural } });

/** RFC-0045 §6's example collection. */
const EVENT_FIELDS: FieldDefinition[] = [
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  {
    key: "venue",
    type: "reference",
    labels: L("Venue"),
    localized: false,
    collections: ["places"],
  },
  {
    key: "speakers",
    type: "repeater",
    labels: L("Speakers"),
    localized: false,
    fields: [
      {
        key: "person",
        type: "reference",
        labels: L("Person"),
        collections: ["people"],
        requiredToPublish: true,
      },
      {
        key: "role",
        type: "select",
        labels: L("Role"),
        options: [
          { value: "host", labels: { en: "Host" } },
          { value: "speaker", labels: { en: "Speaker" } },
          { value: "panelist", labels: { en: "Panelist" } },
        ],
      },
      { key: "talk", type: "text", labels: L("Talk"), maxLength: 200 },
    ],
  },
  { key: "venueName", type: "text", labels: L("Venue name"), localized: false },
];

const SESSION_FIELDS: FieldDefinition[] = [
  {
    key: "agenda",
    type: "repeater",
    labels: L("Agenda"),
    localized: true,
    fields: [
      { key: "topic", type: "text", labels: L("Topic") },
      { key: "host", type: "reference", labels: L("Host"), collections: ["people"] },
    ],
  },
];

const AT = { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" };

interface World {
  store: SiteGraphStore;
  audit: AuditLog;
  site: Site;
  tools: ReturnType<typeof defineTools>;
}

async function world(capable = true): Promise<World> {
  const sql = await BetterSqlite3Driver.open(":memory:");
  await migrate(sql, migrations);
  const store = new SiteGraphStore({
    sql,
    blobs: new MemoryBlobStore(),
    ...(capable ? { fieldTypes: { supported: () => true } } : {}),
  });
  // A site without the starter's taxonomies: published entries need no category here.
  const project = await store.createProject({
    name: "Events",
    slug: "events",
    ownerId: person.id,
    siteIds: [],
  });
  const seeded = await store.createSite({
    projectId: project.id,
    name: "Events",
    slug: "events",
    defaultLocale: "en",
    locales: ["en", "tr"],
    domains: [],
    pageIds: [],
    theme: { name: "blog" },
  });
  const collections = capable
    ? {
        places: { labels: names("Place", "Places") },
        people: { labels: names("Person", "People") },
        events: { labels: names("Event", "Events"), fields: EVENT_FIELDS },
        sessions: { labels: names("Session", "Sessions"), fields: SESSION_FIELDS },
      }
    : {
        places: { labels: names("Place", "Places") },
        events: {
          labels: names("Event", "Events"),
          fields: [{ key: "venueName", type: "text", labels: L("Venue name"), localized: false }],
        },
      };
  const site = await store.updateSite({ ...seeded, collections } as unknown as Site);
  return {
    store,
    audit: new AuditLog(sql),
    site,
    tools: defineTools({ referenceTypes: capable }),
  };
}

function call(w: World, name: string, mode: AgentMode = "edits") {
  const tool = w.tools.find((t) => t.name === name) as World["tools"][number];
  const ctx: ToolContext = {
    store: w.store,
    principal: { actor: agent, scopes: ["*"], mode, ...(mode === "bypass" ? { local: true } : {}) },
  };
  return (args: Record<string, unknown>, confirmed = false) =>
    runTool(tool, { siteId: w.site.id, ...args }, ctx, {
      policy: new PolicyEngine(toolPolicies(w.tools)),
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

function entry(w: World, collection: string, over: Partial<ContentEntry> = {}) {
  return w.store.createContentEntry({
    siteId: w.site.id,
    collection,
    slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
    locale: "en",
    status: "draft",
    title: "Untitled",
    body: { format: "markdown", value: "Body" },
    fields: {},
    tags: [],
    author: person,
    ...over,
  } as never) as Promise<ContentEntry>;
}

const created = (r: { result?: unknown }) =>
  (r.result as { entry: ContentEntry; droppedItems?: unknown }).entry;

describe("RFC-0045 over MCP (rollout step 5)", () => {
  let w: World;
  let hall: ContentEntry;
  let ada: ContentEntry;
  beforeEach(async () => {
    w = await world();
    hall = await entry(w, "places", { title: "Main hall" });
    ada = await entry(w, "people", { title: "Ada Lovelace" });
  });

  it("list_collections returns the open and strict schemas with strictCost", async () => {
    const r = await call(w, "list_collections")({});
    const events = (r.result as { collections: Record<string, unknown>[] }).collections.find(
      (c) => c.key === "events",
    ) as Record<string, JsonSchema & Record<string, unknown>>;
    const open = events.fieldsSchema as JsonSchema;
    const strict = events.fieldsSchemaStrict as JsonSchema;
    expect(open.type).toBe("object");
    expect(strict.type).toBe("object");
    for (const s of [open, strict])
      expect(JSON.stringify(s)).not.toMatch(/\$ref|\$defs|oneOf|anyOf/);
    const props = open.properties as Record<string, JsonSchema>;
    expect(props.venue).toMatchObject({ type: "string", pattern: "^entry_[A-Za-z0-9]{6,32}$" });
    expect(String(props.venue?.description)).toContain("Places (places)");
    expect(((props.speakers as JsonSchema).items as JsonSchema).additionalProperties).toBe(false);
    expect(strict.required).toEqual(["startsAt", "venue", "speakers", "venueName"]);
    expect((strict.properties as Record<string, JsonSchema>).venue?.type).toEqual([
      "string",
      "null",
    ]);
    // The RFC's example plus one text field: 9 properties, 4 levels, 4 enum values, 7 unions.
    expect(events.strictCost).toEqual({ properties: 9, depth: 4, enumValues: 4, unions: 7 });
  });

  it("create with fieldsStrict: nulls store no value, item nulls are stripped, empty items dropped", async () => {
    const none = await call(
      w,
      "create_entry",
    )({
      collection: "events",
      slug: "empty",
      title: "Empty",
      body: "Soon.",
      fieldsStrict: { startsAt: null, venue: null, speakers: null, venueName: null },
    });
    expect(created(none).fields).toEqual({});
    const some = await call(
      w,
      "create_entry",
    )({
      collection: "events",
      slug: "launch",
      title: "Launch",
      body: "Soon.",
      fieldsStrict: {
        startsAt: AT,
        venue: hall.id,
        speakers: [
          { person: ada.id, role: "speaker", talk: null },
          { person: null, role: null, talk: null },
        ],
        venueName: null,
      },
    });
    expect(created(some).fields).toEqual({
      startsAt: AT,
      venue: hall.id,
      speakers: [{ person: ada.id, role: "speaker" }],
    });
    expect((some.result as { droppedItems: unknown }).droppedItems).toEqual([
      { field: "speakers", index: 1 },
    ]);
  });

  it("update with fieldsStrict: null and missing keys leave values; clearFields removes them", async () => {
    const other = await entry(w, "places", { title: "Side room" });
    const e = await entry(w, "events", {
      fields: { startsAt: AT, venue: hall.id, speakers: [{ person: ada.id }], venueName: "Hall" },
    });
    // Changing only the venue leaves startsAt and speakers untouched.
    const r1 = await call(
      w,
      "update_entry",
    )({
      entryId: e.id,
      rev: e.rev,
      fieldsStrict: { startsAt: null, venue: other.id, speakers: null, venueName: null },
    });
    const s1 = created(r1);
    expect(s1.fields).toEqual({ ...e.fields, venue: other.id });
    // A subset of keys leaves the others alone.
    const r2 = await call(
      w,
      "update_entry",
    )({
      entryId: e.id,
      rev: s1.rev,
      fieldsStrict: { venueName: "Side room" },
    });
    const s2 = created(r2);
    expect(s2.fields).toEqual({ ...s1.fields, venueName: "Side room" });
    // clearFields with either input; a null in fieldsStrict for the cleared key is fine.
    const r3 = await call(
      w,
      "update_entry",
    )({
      entryId: e.id,
      rev: s2.rev,
      fieldsStrict: { venue: null },
      clearFields: ["venue", "speakers"],
    });
    expect(created(r3).fields).toEqual({ startsAt: AT, venueName: "Side room" });
  });

  it("refuses set-and-clear, unknown clear keys, clearFields on create and both inputs", async () => {
    const e = await entry(w, "events", { fields: { venue: hall.id } });
    const update = call(w, "update_entry");
    const both = await rejection(
      update({
        entryId: e.id,
        rev: e.rev,
        fieldsStrict: { venue: hall.id },
        clearFields: ["venue"],
      }),
    );
    expect(both.code).toBe("invalid");
    expect(both.message).toContain("set or clear, not both");
    const openBoth = await rejection(
      update({ entryId: e.id, rev: e.rev, fields: { venue: hall.id }, clearFields: ["venue"] }),
    );
    expect(openBoth.code).toBe("invalid");
    const unknown = await rejection(update({ entryId: e.id, rev: e.rev, clearFields: ["nope"] }));
    expect(unknown.code).toBe("unknown_field");
    const strictUnknown = await rejection(
      update({ entryId: e.id, rev: e.rev, fieldsStrict: { nope: null } }),
    );
    expect(strictUnknown.code).toBe("unknown_field");
    const two = await rejection(
      update({ entryId: e.id, rev: e.rev, fields: {}, fieldsStrict: {} }),
    );
    expect(two.code).toBe("invalid");
    const onCreate = await rejection(
      call(
        w,
        "create_entry",
      )({
        collection: "events",
        slug: "x",
        title: "X",
        body: "B",
        clearFields: ["venue"],
      }),
    );
    expect(onCreate.code).toBe("invalid");
    // Every refusal came before anyone was asked, and nothing changed.
    expect((await w.audit.list({ siteId: w.site.id })).every((r) => r.decision === "deny")).toBe(
      true,
    );
    expect((await w.store.getContentEntry(e.id))?.rev).toBe(e.rev);
  });

  it("prechecks reference targets with the store's checker", async () => {
    const other = await seedStarterSite(w.store, { name: "Other", slug: "other" });
    const foreign = await w.store.createContentEntry({
      siteId: other.id,
      collection: "posts",
      slug: "far",
      locale: "en",
      status: "draft",
      title: "Far away",
      body: { format: "markdown", value: "B" },
      fields: {},
      tags: [],
      author: person,
    } as never);
    const e = await entry(w, "events");
    for (const venue of [foreign.id, ada.id, "entry_01HZX8K3QGONE1"]) {
      const bad = await rejection(
        call(w, "update_entry", "manual")({ entryId: e.id, rev: e.rev, fields: { venue } }),
      );
      expect(bad.code, venue).toBe("unknown_entry");
      expect((bad.details.issues as { path: string }[])[0]?.path).toBe("fields/venue");
    }
    const item = await rejection(
      call(
        w,
        "create_entry",
        "manual",
      )({
        collection: "events",
        slug: "y",
        title: "Y",
        body: "B",
        fieldsStrict: { speakers: [{ person: hall.id, role: null, talk: null }] },
      }),
    );
    expect(item.code).toBe("unknown_entry");
    const rows = await w.audit.list({ siteId: w.site.id });
    expect(rows.every((r) => r.decision === "deny")).toBe(true);
  });

  it("names targets readably in update_entry's approval", async () => {
    const bob = await entry(w, "people", { title: "Bob ‮ evil" });
    const e = await entry(w, "events", {
      fields: { speakers: [{ person: ada.id, role: "host" }, { person: bob.id }] },
    });
    const r = await call(
      w,
      "update_entry",
      "manual",
    )({
      entryId: e.id,
      rev: e.rev,
      fields: {
        venue: hall.id,
        speakers: [
          { person: ada.id, role: "host" },
          { person: bob.id },
          { person: ada.id, role: "speaker", talk: "x".repeat(150) },
        ],
      },
    });
    expect(r.decision.kind).toBe("approval-required");
    const prompt = r.approvalPrompt as string;
    expect(prompt).toContain(`"Venue" (venue) → "Main hall" (${hall.id}, Places)`);
    expect(prompt).toContain(
      `"Speakers" (speakers): 2 items → 3 items (added "Ada Lovelace" (${ada.id}, People), Speaker)`,
    );
    // A translation's own id is described as the group it stores, not as unknown.
    const hallTr = await entry(w, "places", {
      title: "Ana salon",
      locale: "tr",
      slug: hall.slug,
      translation: {
        group: hall.id,
        method: "human",
        source: { id: hall.id, locale: "en", rev: hall.rev, hash: await nodeHash(hall) },
      },
    });
    const grace = await entry(w, "people", { title: "Grace Hopper" });
    const canonical = await call(
      w,
      "update_entry",
      "manual",
    )({
      entryId: e.id,
      rev: e.rev,
      fields: {
        venue: hallTr.id,
        speakers: [{ person: grace.id, role: "host" }, { person: bob.id }],
      },
    });
    const text = canonical.approvalPrompt as string;
    expect(text).toContain(`"Venue" (venue) → "Main hall" (${hall.id}, Places)`);
    expect(text).not.toContain("no entry in this site");
    expect(text).toContain(
      `2 items → 2 items (changed item 1: person → "Grace Hopper" (${grace.id}, People))`,
    );
    const removed = await call(
      w,
      "update_entry",
      "manual",
    )({
      entryId: e.id,
      rev: e.rev,
      fields: { speakers: [{ person: ada.id, role: "host" }] },
    });
    expect(removed.approvalPrompt).toContain("2 items → 1 item (removed");
  });

  it("delete_entry refuses in precheck while a published entry shows the target", async () => {
    const event = await entry(w, "events", {
      title: "Launch",
      status: "published",
      fields: { startsAt: AT, venue: hall.id },
    });
    const refused = await rejection(
      call(w, "delete_entry", "manual")({ entryId: hall.id, rev: hall.rev }),
    );
    expect(refused.code).toBe("entry_referenced");
    expect(refused.details.referrers).toEqual([
      { id: event.id, title: "Launch", collection: "events", field: "venue" },
    ]);
    expect(refused.message).toContain("unpublish or edit them");
    expect((await w.audit.list({ siteId: w.site.id }))[0]?.decision).toBe("deny");
    expect(await w.store.getContentEntry(hall.id)).toBeDefined();
    // A draft referrer does not lock: the delete reaches its approval.
    const draft = await entry(w, "places", { title: "Annex" });
    await entry(w, "events", { fields: { venue: draft.id } });
    const asked = await call(w, "delete_entry", "manual")({ entryId: draft.id, rev: draft.rev });
    expect(asked.decision.kind).toBe("approval-required");
  });

  it("list_references answers both directions, site-scoped", async () => {
    const event = await entry(w, "events", {
      title: "Launch",
      status: "published",
      fields: { startsAt: AT, venue: hall.id, speakers: [{ person: ada.id }] },
    });
    const list = call(w, "list_references");
    const to = (await list({ entryId: hall.id, direction: "to" })).result as Record<
      string,
      unknown
    >;
    expect(to.groupId).toBe(hall.id);
    expect(to.notice).toContain("not instructions");
    expect(to.referrers).toEqual([
      expect.objectContaining({ id: event.id, field: "venue", status: "published", shownBy: [] }),
    ]);
    const toAda = (await list({ entryId: ada.id, direction: "to" })).result as {
      referrers: { field: string }[];
    };
    expect(toAda.referrers.map((r) => r.field)).toEqual(["speakers.person"]);
    const from = (await list({ entryId: event.id, direction: "from" })).result as {
      targets: { field: string; groupId: string; members: { title: string }[] }[];
    };
    expect(from.targets.map((t) => [t.field, t.groupId, t.members[0]?.title])).toEqual([
      ["speakers.person", ada.id, "Ada Lovelace"],
      ["venue", hall.id, "Main hall"],
    ]);
    // Reference fields are not list fields before rollout step 8: where refuses them.
    const where = await rejection(
      call(
        w,
        "list_entries",
      )({
        collection: "events",
        where: [{ field: "venue", op: "eq", value: hall.id }],
      }),
    );
    expect(where.code).toBe("invalid_query");
    const listed = (await call(w, "list_entries")({ collection: "places" })).result as {
      entries: { id: string; groupId: string }[];
    };
    expect(listed.entries.find((e) => e.id === hall.id)?.groupId).toBe(hall.id);
    // Another site's view of the entry: not found, as the API's 404.
    const other = await seedStarterSite(w.store, { name: "Other", slug: "other" });
    const foreign = await rejection(list({ siteId: other.id, entryId: hall.id, direction: "to" }));
    expect(foreign.code).toBe("not_found");
  });

  it("translates a localized repeater's text by item path into the translation's own list", async () => {
    const bob = await entry(w, "people", { title: "Bob" });
    const session = await entry(w, "sessions", {
      title: "Day one",
      fields: {
        agenda: [
          { topic: "Opening", host: ada.id },
          { topic: "Close", host: ada.id },
        ],
      },
    });
    const source = async () =>
      (await call(w, "get_translation_source")({ nodeId: session.id, locale: "tr" })).result as {
        fields: Record<string, string>;
        sourceRev: number;
      };
    const src = await source();
    expect(src.fields).toEqual({ "agenda/0/topic": "Opening", "agenda/1/topic": "Close" });
    const save = (fields: Record<string, unknown>, sourceRev?: number) =>
      call(
        w,
        "save_translation",
      )({
        nodeId: session.id,
        locale: "tr",
        title: "Birinci gün",
        slug: "birinci-gun",
        body: "Gövde",
        fields,
        ...(sourceRev === undefined ? {} : { sourceRev }),
      });
    // Item paths name items by index: the source revision they were read at is required.
    expect((await rejection(save({ "agenda/0/topic": "Açılış" }))).code).toBe("invalid");
    expect((await rejection(save({ "agenda/0/topic": "Açılış" }, src.sourceRev + 7))).code).toBe(
      "conflict",
    );
    const bad = await rejection(
      save({ "agenda/1/host": "x", "agenda/9/topic": "y" }, src.sourceRev),
    );
    expect(bad.code).toBe("invalid_fields");
    expect((bad.details.issues as { path: string }[]).map((i) => i.path)).toEqual([
      "fields/agenda/1/host",
      "fields/agenda/9/topic",
    ]);
    const first = (
      await save({ "agenda/0/topic": "Açılış", "agenda/1/topic": "Kapanış" }, src.sourceRev)
    ).result as { node: ContentEntry };
    expect(first.node.fields).toEqual({
      agenda: [
        { topic: "Açılış", host: ada.id },
        { topic: "Kapanış", host: ada.id },
      ],
    });
    // The translation picks its own host for the second item; a partial re-save keeps it, and
    // keeps the first item's translated text.
    const tr = first.node;
    await w.store.updateContentEntry({
      ...tr,
      fields: {
        agenda: [
          { topic: "Açılış", host: ada.id },
          { topic: "Kapanış", host: bob.id },
        ],
      },
    });
    const again = (await save({ "agenda/1/topic": "Son" }, (await source()).sourceRev)).result as {
      node: ContentEntry;
    };
    expect(again.node.fields).toEqual({
      agenda: [
        { topic: "Açılış", host: ada.id },
        { topic: "Son", host: bob.id },
      ],
    });
    // The source reorders its items (same length): the translation's own list was made from
    // the earlier order, so a partial save is refused rather than paired by index.
    const stored = (await w.store.getContentEntry(session.id)) as ContentEntry;
    const items = stored.fields?.agenda as unknown[];
    await w.store.updateContentEntry({ ...stored, fields: { agenda: [items[1], items[0]] } });
    const moved = await rejection(
      save({ "agenda/0/topic": "Kapanış" }, (await source()).sourceRev),
    );
    expect(moved.code).toBe("translation_shape_mismatch");
    expect(moved.message).toContain("whole list");
    // A translation's list of another length than the source's is refused, not overwritten.
    const now = (await w.store.getContentEntry(tr.id)) as ContentEntry;
    await w.store.updateContentEntry({ ...now, fields: { agenda: [{ topic: "Tek" }] } });
    const shape = await rejection(save({ "agenda/0/topic": "x" }, (await source()).sourceRev));
    expect(shape.code).toBe("translation_shape_mismatch");
    expect((await w.store.getContentEntry(tr.id))?.fields).toEqual({ agenda: [{ topic: "Tek" }] });
  });

  it("keeps keys with / in a collection without definitions as plain keys", async () => {
    const place = await entry(w, "places", { title: "Hall", fields: { "og/image": "hall.png" } });
    const saved = (
      await call(
        w,
        "save_translation",
      )({
        nodeId: place.id,
        locale: "tr",
        title: "Salon",
        slug: "salon",
        body: "Gövde",
        fields: { "og/image": "salon.png" },
      })
    ).result as { node: ContentEntry };
    expect(saved.node.fields).toEqual({ "og/image": "salon.png" });
  });

  it("compares items by value, notes reorders, and reads the stored list through the markers", async () => {
    const people = await Promise.all(
      ["P1", "P2", "P3", "P4", "P5", "P6"].map((title) => entry(w, "people", { title })),
    );
    const grace = await entry(w, "people", { title: "Grace Hopper" });
    const list = people.map((p) => ({ person: p.id, role: "speaker" }));
    const e = await entry(w, "events", { fields: { speakers: list } });
    const prompt = async (speakers: unknown[]) =>
      (await call(w, "update_entry", "manual")({ entryId: e.id, rev: e.rev, fields: { speakers } }))
        .approvalPrompt as string;
    // Re-sent unchanged with permuted keys: no notes at all.
    const same = await prompt(list.map((i) => ({ role: i.role, person: i.person })));
    expect(same).toContain('"Speakers" (speakers): 6 items → 6 items');
    expect(same).not.toMatch(/changed|added|removed|reordered/);
    // Only item 5 changes, and it is the one shown.
    const fifth = list.map((i, n) =>
      n === 4 ? { role: "speaker", person: grace.id } : { role: i.role, person: i.person },
    );
    expect(await prompt(fifth)).toContain(
      `6 items → 6 items (changed item 5: person → "Grace Hopper" (${grace.id}, People))`,
    );
    // A removal plus a swap shows the reorder too.
    const swapped = [list[2], list[1], list[3], list[4], list[5]];
    const both = await prompt(swapped);
    expect(both).toContain("removed");
    expect(both).toContain("reordered");
    // During a sub-field rename, an entry not rewritten yet still reads as unchanged.
    const both2 = [
      await entry(w, "events", { fields: { speakers: [{ person: grace.id, talk: "Hi" }] } }),
      await entry(w, "events", { fields: { speakers: [{ person: grace.id, talk: "Yo" }] } }),
    ];
    const started = await runFieldOperation(
      w.store,
      w.site.id,
      { op: "rename_field", collection: "events", from: "speakers", sub: "talk", to: "abstract" },
      { actor: agent, budget: { entries: 1 } },
    );
    expect(started.done).toBe(false);
    const current = await Promise.all(both2.map((x) => w.store.getContentEntry(x.id)));
    const holds = (x: ContentEntry | undefined) =>
      JSON.stringify(x?.fields?.speakers ?? []).includes('"talk"');
    const raw = current.find(holds) as ContentEntry;
    const [item] = (raw.fields?.speakers ?? []) as { talk: string }[];
    const marked = (
      await call(
        w,
        "update_entry",
        "manual",
      )({
        entryId: raw.id,
        rev: raw.rev,
        fields: { speakers: [{ person: grace.id, abstract: item?.talk }] },
      })
    ).approvalPrompt as string;
    expect(marked).toContain("1 item → 1 item");
    expect(marked).not.toMatch(/changed|added|removed|reordered/);
  });

  it("refuses setting one key of a running rename while clearing the other", async () => {
    await entry(w, "events", { fields: { venueName: "Hall" } });
    const e = await entry(w, "events", { fields: { venueName: "Annex" } });
    await runFieldOperation(
      w.store,
      w.site.id,
      { op: "rename_field", collection: "events", from: "venueName", to: "placeName" },
      { actor: agent, budget: { entries: 1 } },
    );
    const now = (await w.store.getContentEntry(e.id)) as ContentEntry;
    for (const args of [
      { fields: { venueName: "Ada" }, clearFields: ["placeName"] },
      { fields: { venueName: "Ada", placeName: null } },
      { fields: { placeName: "Ada" }, clearFields: ["venueName"] },
    ]) {
      const refused = await rejection(
        call(w, "update_entry", "manual")({ entryId: now.id, rev: now.rev, ...args }),
      );
      expect(refused.code, JSON.stringify(args)).toBe("invalid");
    }
  });

  it("clearFields removes a value during an unfinished rename_field, by either key", async () => {
    const a1 = await entry(w, "events", { fields: { venueName: "Hall" } });
    const a2 = await entry(w, "events", { fields: { venueName: "Annex" } });
    const started = await runFieldOperation(
      w.store,
      w.site.id,
      { op: "rename_field", collection: "events", from: "venueName", to: "placeName" },
      { actor: agent, budget: { entries: 1 } },
    );
    expect(started.done).toBe(false);
    const left = [a1, a2];
    const pending: ContentEntry[] = [];
    for (const e of left) {
      const now = (await w.store.getContentEntry(e.id)) as ContentEntry;
      if (Object.hasOwn(now.fields ?? {}, "venueName")) pending.push(now);
    }
    expect(pending).toHaveLength(1);
    const [one] = pending as [ContentEntry];
    const ask = await call(
      w,
      "update_entry",
      "manual",
    )({
      entryId: one.id,
      rev: one.rev,
      clearFields: ["placeName"],
    });
    expect(ask.approvalPrompt).toContain('"Venue name" (placeName) removed');
    expect(ask.approvalPrompt).not.toContain("venueName removed");
    const r = await call(
      w,
      "update_entry",
    )({ entryId: one.id, rev: one.rev, clearFields: ["placeName"] });
    expect(created(r).fields).toEqual({});
    // The old key is a valid name for it too while the rename runs.
    const other = left.find((e) => e.id !== one.id) as ContentEntry;
    const fresh = (await w.store.getContentEntry(other.id)) as ContentEntry;
    const r2 = await call(
      w,
      "update_entry",
    )({ entryId: fresh.id, rev: fresh.rev, clearFields: ["venueName"] });
    expect(created(r2).fields).toEqual({});
  });

  it("operation tools take sub, the reference inputs, and continue with onInvalid clear", async () => {
    const e = await entry(w, "events", { fields: { speakers: [{ person: ada.id, talk: "Hi" }] } });
    const rename = await call(w, "rename_field")(
      { collection: "events", from: "speakers", sub: "talk", to: "abstract" },
      true,
    );
    expect(rename.result).toMatchObject({ done: true });
    expect((await w.store.getContentEntry(e.id))?.fields?.speakers).toEqual([
      { person: ada.id, abstract: "Hi" },
    ]);
    const ask = await call(
      w,
      "change_field_type",
      "bypass",
    )({
      collection: "events",
      key: "speakers",
      sub: "abstract",
      type: "richText",
    });
    expect(ask.approvalPrompt).toContain(
      'Change the sub-field abstract of the field "Speakers" (speakers) of events from text to richText?',
    );
    // text → reference with collections: a title converts to its group, then a second entry's
    // target is archived mid-run, so the continuation needs onInvalid: "clear".
    await entry(w, "events", { fields: { venueName: "Main hall" } });
    await entry(w, "events", { fields: { venueName: "Main hall" } });
    const started = await runFieldOperation(
      w.store,
      w.site.id,
      {
        op: "change_field_type",
        collection: "events",
        key: "venueName",
        type: "reference",
        collections: ["places"],
      },
      { actor: agent, budget: { entries: 1 } },
    );
    expect(started.done).toBe(false);
    const stored = (await w.store.getContentEntry(hall.id)) as ContentEntry;
    await w.store.updateContentEntry({ ...stored, status: "archived" });
    const resume = {
      collection: "events",
      key: "venueName",
      type: "reference",
      operationId: started.operationId,
    };
    const stuck = await call(w, "change_field_type")(resume, true);
    expect(stuck.result).toMatchObject({ done: false });
    expect((stuck.result as { unconvertible: unknown[] }).unconvertible).toHaveLength(1);
    const prompt = await call(w, "change_field_type", "bypass")({ ...resume, onInvalid: "clear" });
    expect(prompt.approvalPrompt).toContain("Values that stopped converting meanwhile are dropped");
    // The headline is the stored operation's, whatever this call's type says; the report counts
    // the dropped value as cleared, with no refusal.
    const done = await call(w, "change_field_type")(
      { ...resume, type: "number", onInvalid: "clear" },
      true,
    );
    const res = done.result as {
      done: boolean;
      prompt: string;
      report: { cleared: number; unconvertible: number; refusal?: unknown };
    };
    expect(res.done).toBe(true);
    expect(res.prompt).toContain("from text to reference");
    expect(res.report).toMatchObject({ cleared: 1, unconvertible: 0 });
    expect(res.report.refusal).toBeUndefined();
  });
});

describe("RFC-0045 production gate over MCP (no fieldTypes)", () => {
  it("lists only the enabled types, and every write path refuses the two types", async () => {
    const w = await world(false);
    const variants = (tools: ReturnType<typeof defineTools>) => {
      const update = tools.find((t) => t.name === "update_collection") as (typeof tools)[number];
      // defineTools hoists every nested $defs to the tool schema's root.
      const defs = update.inputSchema.$defs as Record<string, JsonSchema>;
      const oneOf = (defs.FieldDefinition?.oneOf ?? []) as JsonSchema[];
      const types = oneOf.map(
        (v) => (v.properties as Record<string, { enum: string[] }>).type?.enum[0],
      );
      const retype = tools.find((t) => t.name === "change_field_type") as (typeof tools)[number];
      const target = (retype.inputSchema.properties as Record<string, JsonSchema>).type?.enum as
        | string[]
        | undefined;
      return { types, target };
    };
    for (const [list, expected] of [
      [defaultToolList(false), false],
      [defaultToolList(true), true],
    ] as const) {
      const { types, target } = variants(list);
      expect(types.includes("reference"), String(expected)).toBe(expected);
      expect(types.includes("repeater")).toBe(expected);
      expect(target?.includes("reference")).toBe(expected);
    }
    const venue = {
      key: "venue",
      type: "reference",
      labels: L("Venue"),
      localized: false,
      collections: ["places"],
    };
    const update = await rejection(
      call(w, "update_collection")({ collection: "events", fields: [venue] }, true),
    );
    expect(update.code).toBe("fields_unsupported");
    const retype = await rejection(
      call(
        w,
        "change_field_type",
      )({
        collection: "events",
        key: "venueName",
        type: "reference",
        collections: ["places"],
      }),
    );
    expect(retype.code).toBe("fields_unsupported");
    const repeater = await rejection(
      call(
        w,
        "change_field_type",
      )({
        collection: "events",
        key: "venueName",
        type: "repeater",
        subFields: [{ key: "line", type: "text", labels: L("Line") }],
      }),
    );
    expect(repeater.code).toBe("fields_unsupported");
    // fieldsStrict itself works for the enabled types.
    const ok = await call(
      w,
      "create_entry",
    )({
      collection: "events",
      slug: "plain",
      title: "Plain",
      body: "B",
      fieldsStrict: { venueName: null },
    });
    expect(created(ok).fields).toEqual({});
    expect((await w.store.getSite(w.site.id))?.collections?.events?.fields).toHaveLength(1);
  });
});
