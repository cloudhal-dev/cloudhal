/**
 * Shared API suite for RFC-0045 rollout step 2: the entry picker, an entry's referrers, and the
 * status codes of the reference refusals on the entry routes. The types stay refused in
 * production; the suite wraps the factory's storage in a store with `fieldTypes`.
 */
import type { ContentEntry, Site } from "@cloudhal/core-contracts";
import { nodeHash, SiteGraphStore } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
const L = (label: string) => ({ en: { label } });
type Json = Record<string, unknown>;

export function describeReferencesApi(label: string, factory: ApiStoreFactory): void {
  describe(`API references (RFC-0045 step 2): ${label}`, () => {
    let store: SiteGraphStore;
    let site: Site;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json().catch(() => ({}))) as Json };
    };
    const entry = (collection: string, over: Partial<ContentEntry> = {}) =>
      store.createContentEntry({
        siteId: site.id,
        collection,
        slug: `${collection}-${Math.random().toString(36).slice(2, 8)}`,
        locale: "en",
        status: "draft",
        title: "Untitled",
        body: { format: "markdown", value: "Body" },
        fields: {},
        tags: [],
        author: human,
        ...over,
      } as never);

    beforeEach(async () => {
      const base = await factory.create();
      store = new SiteGraphStore({
        sql: base.sql,
        blobs: base.blobs,
        fieldTypes: { supported: () => true },
      });
      const project = await store.createProject({
        name: "Refs",
        slug: `refs-${Math.random().toString(36).slice(2, 8)}`,
        ownerId: human.id,
        siteIds: [],
      });
      site = await store.createSite({
        projectId: project.id,
        name: "Refs",
        slug: `refs-${Math.random().toString(36).slice(2, 8)}`,
        defaultLocale: "en",
        locales: ["en", "tr"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
        collections: {
          places: {},
          events: {
            fields: [
              {
                key: "venue",
                type: "reference",
                labels: L("Venue"),
                localized: false,
                collections: ["places"],
              },
              {
                key: "altVenue",
                type: "reference",
                labels: L("Alternative venue"),
                localized: true,
                collections: ["places"],
              },
            ],
          },
        },
      });
      app = createApi({
        store,
        resolveActor: async (c) => (c.req.header("x-test-user") ? human : undefined),
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("picks entries of the allowed collections by a substring, never archived ones", async () => {
      const main = await entry("places", { title: "Main Hall", slug: "main-hall" });
      await entry("places", { title: "Old hall", status: "archived" });
      await entry("places", { title: "Garden" });
      await entry("events", { title: "Hall party" });
      const picked = await call(`/api/sites/${site.id}/entries/pick?collections=places&q=HALL`);
      expect(picked.status, JSON.stringify(picked.body)).toBe(200);
      expect(picked.body.entries).toEqual([
        {
          groupId: main.id,
          id: main.id,
          title: "Main Hall",
          collection: "places",
          status: "draft",
          locale: "en",
        },
      ]);
      const long = await call(
        `/api/sites/${site.id}/entries/pick?collections=places&q=${"a".repeat(100_001)}`,
      );
      expect(long.status).toBe(400);
      expect((await call(`/api/sites/${site.id}/entries/pick`)).status).toBe(400);
      expect(
        (await call("/api/sites/site_01HZX8K3QNONE/entries/pick?collections=places")).status,
      ).toBe(404);
    });

    it("answers chosen groups' members in this site, any status, and nothing for a gone one", async () => {
      const hall = await entry("places", { title: "Main Hall", status: "archived" });
      const salon = await entry("places", {
        title: "Ana salon",
        locale: "tr",
        slug: `${hall.slug}-tr`,
        translation: {
          group: hall.id,
          method: "human",
          source: { id: hall.id, locale: hall.locale, rev: hall.rev, hash: await nodeHash(hall) },
        },
      });
      const gone = "entry_01HZX8K3QGONE1";
      const res = await call(`/api/sites/${site.id}/entries/groups?ids=${hall.id},${gone}`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const groups = res.body.groups as Record<string, { id: string; status: string }[]>;
      expect(groups[hall.id]?.map((m) => [m.id, m.status])).toEqual([
        [hall.id, "archived"],
        [salon.id, "draft"],
      ]);
      expect(groups[gone]).toEqual([]);
      expect((await call(`/api/sites/${site.id}/entries/groups`)).status).toBe(400);
      expect((await call(`/api/sites/${site.id}/entries/groups?ids=nope`)).status).toBe(400);
      const many = Array.from({ length: 101 }, (_, i) => `entry_${String(i).padStart(8, "0")}`);
      expect(
        (await call(`/api/sites/${site.id}/entries/groups?ids=${many.join(",")}`)).status,
      ).toBe(400);
      expect(
        (await call(`/api/sites/site_01HZX8K3QNONE/entries/groups?ids=${hall.id}`)).status,
      ).toBe(404);
    });

    it("folds case and diacritics on both sides, Turkish İ and ı included", async () => {
      const cicek = await entry("places", { title: "Çiçek Pasajı", slug: "cicek-pasaji" });
      const kongre = await entry("places", { title: "İstanbul Kongre", slug: "kongre" });
      const pick = async (q: string) =>
        (
          (
            await call(
              `/api/sites/${site.id}/entries/pick?collections=places&q=${encodeURIComponent(q)}`,
            )
          ).body.entries as { id: string }[]
        ).map((e) => e.id);
      expect(await pick("ÇİÇEK")).toEqual([cicek.id]);
      expect(await pick("Çiçek")).toEqual([cicek.id]);
      expect(await pick("pasaji")).toEqual([cicek.id]);
      expect(await pick("istanbul")).toEqual([kongre.id]);
      expect(await pick("İSTANBUL")).toEqual([kongre.id]);
      expect(await pick("KONG")).toEqual([kongre.id]);
    });

    it("shows a translation under the original's non-localized row even when it holds a row itself", async () => {
      const hall = await entry("places", { title: "Main Hall" });
      const original = await entry("events", {
        title: "Launch",
        status: "published",
        fields: { venue: hall.id },
      });
      const translation = await entry("events", {
        title: "Lansman",
        locale: "tr",
        slug: `${original.slug}-tr`,
        status: "published",
        fields: { altVenue: hall.id },
        translation: {
          group: original.id,
          method: "human",
          source: {
            id: original.id,
            locale: original.locale,
            rev: original.rev,
            hash: await nodeHash(original),
          },
        },
      });
      // every page, for a page size: the result must not depend on where the pages are cut
      const rows = async (limit: number) => {
        const out: { id: string; field: string; shownBy: { id: string }[] }[] = [];
        for (let offset: number | undefined = 0; offset !== undefined; ) {
          const page = (
            await call(
              `/api/sites/${site.id}/entries/${hall.id}/references?limit=${limit}&offset=${offset}`,
            )
          ).body as { referrers: typeof out; next?: number };
          out.push(...page.referrers);
          offset = page.next;
        }
        return out;
      };
      for (const limit of [20, 1]) {
        const venue = (await rows(limit)).find((r) => r.field === "venue");
        expect(venue?.id).toBe(original.id);
        expect(venue?.shownBy.map((m) => m.id)).toEqual([translation.id]);
      }
      const alt = (await rows(20)).find((r) => r.field === "altVenue");
      expect(alt).toMatchObject({ id: translation.id, shownBy: [] });
    });

    it("lists referrers with the members that show their value, and refuses what strands them", async () => {
      const hall = await entry("places", { title: "Main Hall" });
      const event = await entry("events", {
        title: "Launch",
        status: "published",
        fields: { venue: hall.id },
      });
      const refs = await call(`/api/sites/${site.id}/entries/${hall.id}/references`);
      expect(refs.status, JSON.stringify(refs.body)).toBe(200);
      expect(refs.body.groupId).toBe(hall.id);
      const [first] = refs.body.referrers as { id: string; field: string; shownBy: unknown[] }[];
      expect(first).toMatchObject({ id: event.id, field: "venue", shownBy: [] });
      const del = await call(`/api/sites/${site.id}/entries/${hall.id}?rev=${hall.rev}`, {
        method: "DELETE",
      });
      expect(del.status).toBe(409);
      expect(del.body.error).toBe("entry_referenced");
      const bad = await call(`/api/sites/${site.id}/entries/${event.id}`, {
        method: "PUT",
        body: JSON.stringify({ ...event, fields: { venue: "entry_01HZX8K3QGONE" } }),
      });
      expect(bad.status).toBe(422);
      expect(bad.body.error).toBe("unknown_entry");
    });

    it("asks a delete first (dryRun=1): the store's refusal with its referrers, and nothing deleted", async () => {
      const hall = await entry("places", { title: "Main Hall" });
      const garden = await entry("places", { title: "Garden" });
      const event = await entry("events", {
        title: "Launch",
        status: "published",
        fields: { venue: hall.id },
      });
      const ask = await call(`/api/sites/${site.id}/entries/${hall.id}?rev=${hall.rev}&dryRun=1`, {
        method: "DELETE",
      });
      expect(ask.status).toBe(409);
      expect(ask.body.error).toBe("entry_referenced");
      const details = ask.body.details as { total: number; referrers: { id: string }[] };
      expect(details.total).toBe(1);
      expect(details.referrers.map((r) => r.id)).toEqual([event.id]);
      const free = await call(
        `/api/sites/${site.id}/entries/${garden.id}?rev=${garden.rev}&dryRun=1`,
        { method: "DELETE" },
      );
      expect(free.status).toBe(200);
      expect(free.body).toEqual({ dryRun: true });
      expect(await store.getContentEntry(garden.id)).toBeDefined();
    });

    it("lists what publishing would show as nothing, with the holder's title", async () => {
      const hall = await entry("places", { title: "Main Hall" });
      const event = await entry("events", {
        title: "Launch",
        status: "published",
        fields: { venue: hall.id },
      });
      const res = await call(`/api/sites/${site.id}/entries/reference-issues`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.issues).toEqual([
        expect.objectContaining({
          entryId: event.id,
          title: "Launch",
          path: "fields/venue",
          groupId: hall.id,
          reason: "hidden",
        }),
      ]);
    });

    it("reports the field-type capability to Studio", async () => {
      const res = await call("/api/instance");
      expect((res.body.features as { referenceFields?: boolean }).referenceFields).toBe(true);
    });
  });
}
