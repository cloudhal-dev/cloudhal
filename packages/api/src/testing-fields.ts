/**
 * Shared API suite for RFC-0041 step 2: entry routes validate typed field values through the store
 * and answer with each issue's path (`details.issues`); `null` removes a key in a collection with
 * definitions; `PUT /collections/:key` takes definitions with the §6 guard (dry run included).
 * Runs against any SiteGraphStore backend, like `testing.ts`.
 */
import type { FieldDefinition, Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };

type Json = Record<string, unknown>;

const FIELDS: FieldDefinition[] = [
  {
    key: "venue",
    type: "text",
    labels: { en: { label: "Venue" } },
    localized: true,
    requiredToPublish: true,
  },
  {
    key: "seats",
    type: "number",
    labels: { en: { label: "Seats" } },
    localized: false,
    integer: true,
  },
  {
    key: "level",
    type: "select",
    labels: { en: { label: "Level" } },
    localized: false,
    options: [
      { value: "beginner", labels: { en: "Beginner" } },
      { value: "expert", labels: { en: "Expert" } },
    ],
  },
];
const EVENTS = { labels: { en: { singular: "Event", plural: "Events" } }, fields: FIELDS };

export function describeFieldsApi(label: string, factory: ApiStoreFactory): void {
  describe(`API typed fields: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const site = async () => (await call(`/api/sites/${siteId}`)).body as unknown as Site;
    const put = async (settings: unknown, query = "") =>
      call(`/api/sites/${siteId}/collections/events${query}`, {
        method: "PUT",
        body: JSON.stringify({ settings, rev: (await site()).rev }),
      });
    const create = (fields: Json, status = "draft") =>
      call(`/api/sites/${siteId}/entries`, {
        method: "POST",
        body: JSON.stringify({
          collection: "events",
          slug: `e-${Math.random().toString(36).slice(2, 8)}`,
          locale: "en",
          status,
          title: "Launch",
          body: { format: "markdown", value: "Body" },
          fields,
          tags: [],
        }),
      });
    const issues = (body: Json) =>
      ((body.details as { issues?: { path: string; code: string }[] }).issues ?? []).map(
        (i) => `${i.path} ${i.code}`,
      );

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Fields", slug: "fields" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("declares fields; a dry run checks them and writes nothing", async () => {
      const dry = await put(EVENTS, "?dryRun=1");
      expect(dry.status, JSON.stringify(dry.body)).toBe(200);
      expect((await site()).collections?.events).toBeUndefined();
      const bad = await put({ fields: [{ ...FIELDS[0], key: "title" }] }, "?dryRun=1");
      expect(bad.status).toBe(400);
      expect(bad.body.error).toBe("field_key_reserved");
      expect(issues(bad.body)).toEqual(["collections/events/fields/0/key field_key_reserved"]);
      const saved = await put(EVENTS);
      expect(saved.status, JSON.stringify(saved.body)).toBe(200);
      expect((await site()).collections?.events?.fields).toEqual(FIELDS);
    });

    it("refuses a definition change that would lose stored values (409)", async () => {
      expect((await put(EVENTS)).status).toBe(200);
      expect((await create({ level: "expert" })).status).toBe(201);
      const dropped = await put({ ...EVENTS, fields: FIELDS.filter((f) => f.key !== "level") });
      expect(dropped.status).toBe(409);
      expect(dropped.body.error).toBe("field_change_needs_operation");
      expect(dropped.body.message).toContain("remove_field");
      const retyped = await put({
        ...EVENTS,
        fields: FIELDS.map((f) =>
          f.key === "seats"
            ? { key: "seats", type: "text", labels: f.labels, localized: false }
            : f,
        ),
      });
      expect(retyped.status).toBe(409);
      expect(retyped.body.error).toBe("field_change_needs_operation");
    });

    it("entry routes answer value problems with paths (422)", async () => {
      expect((await put(EVENTS)).status).toBe(200);
      const bad = await create({ seats: 1.5, level: "master" });
      expect(bad.status).toBe(422);
      expect(bad.body.error).toBe("invalid_fields");
      expect(issues(bad.body).sort()).toEqual([
        "fields/level invalid_value",
        "fields/seats invalid_value",
      ]);
      const unknown = await create({ colour: "red" });
      expect(unknown.status).toBe(422);
      expect(unknown.body.error).toBe("unknown_field");
      const required = await create({ seats: 10 }, "review");
      expect(required.status).toBe(422);
      expect(required.body.error).toBe("required_field");
      expect(issues(required.body)).toEqual(["fields/venue required_field"]);
    });

    it("null removes a key in a collection with fields, on create and update", async () => {
      expect((await put(EVENTS)).status).toBe(200);
      const made = await create({ venue: "Hall", seats: 10, level: null });
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      expect(made.body.fields).toEqual({ venue: "Hall", seats: 10 });
      const updated = await call(`/api/sites/${siteId}/entries/${made.body.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...made.body, fields: { venue: "Hall", seats: null } }),
      });
      expect(updated.status, JSON.stringify(updated.body)).toBe(200);
      expect(updated.body.fields).toEqual({ venue: "Hall" });
    });

    it("collections without fields keep any JSON, nulls included", async () => {
      expect((await put({ labels: EVENTS.labels })).status).toBe(200);
      const loose = { anything: [1, null], gone: null };
      const made = await create(loose);
      expect(made.status, JSON.stringify(made.body)).toBe(201);
      expect(made.body.fields).toEqual(loose);
    });
  });
}
