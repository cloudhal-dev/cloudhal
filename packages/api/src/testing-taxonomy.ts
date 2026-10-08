/**
 * Shared API suite for RFC-0002 §6.1 (taxonomies, terms, governance, redirects, the tags
 * migration) — runs against any SiteGraphStore backend, like `testing.ts`.
 */
import type { ContentEntry, Redirect, Snapshot, Taxonomy, Term } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "./app.ts";
import type { GovernancePreview } from "./governance.ts";
import type { ApiStoreFactory } from "./testing.ts";

const human = { kind: "human" as const, id: "user_apitest00001", name: "Tester" };
const agent = { kind: "agent" as const, id: "agent_apitest0001", name: "Bot" };

type Json = Record<string, unknown>;

export function describeTaxonomyApi(label: string, factory: ApiStoreFactory): void {
  describe(`API taxonomy: ${label}`, () => {
    let store: SiteGraphStore;
    let siteId: string;
    let app: ReturnType<typeof createApi>;
    const headers = { "content-type": "application/json", "x-test-user": "1" };
    const call = async (path: string, init: RequestInit = {}) => {
      const res = await app.request(path, { headers, ...init });
      return { status: res.status, body: (await res.json()) as Json };
    };
    const post = (path: string, body: unknown) =>
      call(path, { method: "POST", body: JSON.stringify(body) });
    const put = (path: string, body: unknown) =>
      call(path, { method: "PUT", body: JSON.stringify(body) });
    const base = () => `/api/sites/${siteId}`;
    const snapshotCount = async () => (await store.listSnapshots(siteId, 500)).length;
    const taxonomy = async (key: string) => (await store.getTaxonomyByKey(siteId, key)) as Taxonomy;
    const term = async (key: string, slug: string) =>
      (await store.getTermBySlug(siteId, key, slug)) as Term;
    const newTerm = async (key: string, slug: string, patch: Partial<Term> = {}) => {
      const r = await post(`${base()}/terms`, {
        taxonomyId: (await taxonomy(key)).id,
        slug,
        labels: { en: { name: slug.toUpperCase() } },
        ...patch,
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return r.body.term as Term;
    };
    const post1 = async () =>
      (await store.listContentEntries(siteId, "posts")).find(
        (e) => e.slug === "hello-world",
      ) as ContentEntry;

    beforeEach(async () => {
      store = await factory.create();
      siteId = (await seedStarterSite(store, { name: "Tax Site", slug: "tax-site" })).id;
      app = createApi({
        store,
        resolveActor: async (c) => {
          const who = c.req.header("x-test-user");
          return who === "agent" ? agent : who ? human : undefined;
        },
      });
    });

    afterAll(async () => {
      await factory.dispose?.();
    });

    it("is for people: anonymous 401, agent keys 403", async () => {
      expect((await app.request(`${base()}/terms`)).status).toBe(401);
      const r = await app.request(`${base()}/terms`, { headers: { "x-test-user": "agent" } });
      expect(r.status).toBe(403);
    });

    it("taxonomies: list, create (one snapshot), update, reserved key 400, path conflict 409", async () => {
      const list = await call(`${base()}/taxonomies`);
      expect((list.body as unknown as Taxonomy[]).map((t) => t.key).sort()).toEqual([
        "category",
        "tag",
      ]);
      const before = await snapshotCount();
      const created = await post(`${base()}/taxonomies`, {
        key: "series",
        labels: { en: { singular: "Series", plural: "Series" } },
        hierarchical: false,
        allowNewTerms: "none",
        required: false,
        archive: { enabled: true, basePath: "/series" },
        feed: true,
        minEntriesToIndex: 3,
      });
      expect(created.status).toBe(201);
      expect(await snapshotCount()).toBe(before + 1);
      const snap = created.body.snapshot as Snapshot;
      expect(snap.label).toBe("create_taxonomy by Tester");
      expect(snap.reason).toBe("manual");
      const series = created.body.taxonomy as Taxonomy;
      const updated = await put(`${base()}/taxonomies/${series.id}`, {
        ...series,
        minEntriesToIndex: 5,
      });
      expect(updated.status).toBe(200);
      expect((updated.body.taxonomy as Taxonomy).rev).toBe(1);

      const reserved = await post(`${base()}/taxonomies`, {
        key: "status",
        labels: { en: { singular: "S", plural: "S" } },
        hierarchical: false,
        allowNewTerms: "none",
        required: false,
        archive: { enabled: false, basePath: "/status" },
        feed: false,
        minEntriesToIndex: 3,
      });
      expect(reserved.status).toBe(400);
      expect(reserved.body.error).toBe("reserved_key");
      const clash = await post(`${base()}/taxonomies`, {
        key: "topic",
        labels: { en: { singular: "Topic", plural: "Topics" } },
        hierarchical: false,
        allowNewTerms: "none",
        required: false,
        archive: { enabled: true, basePath: "/about" },
        feed: false,
        minEntriesToIndex: 3,
      });
      expect(clash.status).toBe(409);
      expect(clash.body.error).toBe("path_conflict");
    });

    it("terms: list with usage, status and synonym search; create and update with one snapshot each", async () => {
      const all = await call(`${base()}/terms?taxonomy=category`);
      const items = all.body.items as { term: Term; usage: { total: number; published: number } }[];
      expect(items.map((i) => i.term.slug)).toEqual(["news"]);
      expect(items[0]?.usage).toMatchObject({ total: 1, published: 1 });

      const before = await snapshotCount();
      const js = await newTerm("tag", "javascript", {
        labels: { en: { name: "JavaScript", altNames: ["JS"] } },
      });
      expect(await snapshotCount()).toBe(before + 1);
      const bySynonym = await call(`${base()}/terms?taxonomy=tag&q=js`);
      expect((bySynonym.body.items as { term: Term }[]).map((i) => i.term.id)).toContain(js.id);
      const proposed = await call(`${base()}/terms?taxonomy=tag&status=proposed`);
      expect(proposed.body.items).toEqual([]);
      expect((await call(`${base()}/terms?status=gone`)).status).toBe(400);

      const updated = await put(`${base()}/terms/${js.id}`, {
        ...js,
        labels: { en: { name: "JavaScript", altNames: ["JS", "ECMAScript"] } },
        position: 2,
      });
      expect(updated.status).toBe(200);
      expect((updated.body.snapshot as Snapshot).label).toBe("update_term by Tester");
      const detail = await call(`${base()}/terms/${js.id}`);
      expect((detail.body.term as Term).position).toBe(2);
      expect(detail.body.usage).toEqual({ total: 0, published: 0 });

      // The slug changes only through rename; a taken slug is a conflict.
      const slugEdit = await put(`${base()}/terms/${js.id}`, {
        ...(updated.body.term as Term),
        slug: "js",
      });
      expect(slugEdit.status).toBe(400);
      expect(slugEdit.body.error).toBe("immutable_field");
      const dup = await post(`${base()}/terms`, {
        taxonomyId: (await taxonomy("tag")).id,
        slug: "javascript",
        labels: { en: { name: "Dup" } },
      });
      expect(dup.status).toBe(409);
      expect(dup.body.error).toBe("slug_taken");
      // A synonym that names another term is refused (invariant 12).
      const hijack = await post(`${base()}/terms`, {
        taxonomyId: (await taxonomy("tag")).id,
        slug: "ts",
        labels: { en: { name: "TypeScript", altNames: ["JavaScript"] } },
      });
      expect(hijack.status).toBe(422);
      expect(hijack.body.error).toBe("invalid_labels");
    });

    it("rename: dry-run preview, then one snapshot with the archive redirect; stale rev 409", async () => {
      const cloudhal = await term("tag", "cloudhal");
      const preview = await post(`${base()}/terms/${cloudhal.id}/rename`, {
        slug: "cloudhal-cms",
        dryRun: true,
      });
      expect(preview.status).toBe(200);
      const p = preview.body.preview as GovernancePreview;
      expect(p.entries).toMatchObject({ count: 1, rewritten: false });
      expect(p.redirects).toEqual([
        {
          from: "/tag/cloudhal",
          to: "/tag/cloudhal-cms",
          status: 301,
          match: "prefix",
          reason: "slug-change",
        },
      ]);
      const before = await snapshotCount();
      expect((await term("tag", "cloudhal")).rev).toBe(cloudhal.rev);

      const done = await post(`${base()}/terms/${cloudhal.id}/rename`, {
        slug: "cloudhal-cms",
        rev: cloudhal.rev,
      });
      expect(done.status).toBe(200);
      const result = done.body.result as { terms: Term[]; redirects: Redirect[] };
      expect(result.terms[0]?.slug).toBe("cloudhal-cms");
      expect(result.redirects.map((r) => [r.from, r.to])).toEqual([
        ["/tag/cloudhal", "/tag/cloudhal-cms"],
      ]);
      expect(await snapshotCount()).toBe(before + 1);
      expect((done.body.snapshot as Snapshot).label).toBe("rename_term by Tester");

      const stale = await post(`${base()}/terms/${cloudhal.id}/rename`, {
        slug: "cms",
        rev: cloudhal.rev,
      });
      expect(stale.status).toBe(409);
      expect(stale.body.error).toBe("conflict");
      // The old slug stays reserved by the history.
      const taken = await post(`${base()}/terms`, {
        taxonomyId: (await taxonomy("tag")).id,
        slug: "cloudhal",
        labels: { en: { name: "Again" } },
      });
      expect(taken.status).toBe(409);
      expect(taken.body.error).toBe("slug_taken");
      // The term detail lists the redirect it left behind.
      const detail = await call(`${base()}/terms/${cloudhal.id}`);
      expect((detail.body.redirects as Redirect[]).map((r) => r.from)).toEqual(["/tag/cloudhal"]);
    });

    it("merge: previews and rewrites the entries, leaves a merge redirect", async () => {
      const cms = await newTerm("tag", "cms");
      const entry = await post1();
      const tagged = await store.updateContentEntry({
        ...entry,
        terms: { ...entry.terms, tag: { ids: [cms.id] } },
      });
      const cloudhal = await term("tag", "cloudhal");
      const preview = await post(`${base()}/terms/${cms.id}/merge`, {
        into: cloudhal.id,
        dryRun: true,
      });
      const p = preview.body.preview as GovernancePreview;
      expect(p.entries.count).toBe(1);
      expect(p.entries.items[0]?.id).toBe(tagged.id);
      expect(p.redirects.map((r) => [r.from, r.to, r.reason])).toEqual([
        ["/tag/cms", "/tag/cloudhal", "merge"],
      ]);
      const before = await snapshotCount();
      const done = await post(`${base()}/terms/${cms.id}/merge`, { into: cloudhal.id });
      expect(done.status).toBe(200);
      expect((done.body.result as { entries: number }).entries).toBe(1);
      expect(await snapshotCount()).toBe(before + 1);
      expect((await post1()).terms?.tag?.ids).toEqual([cloudhal.id]);
      expect((await store.getTerm(cms.id))?.mergedInto).toBe(cloudhal.id);
    });

    it("retire: required category is 422 (preview says why); a tag without redirect answers 410", async () => {
      const news = await term("category", "news");
      const preview = await post(`${base()}/terms/${news.id}/retire`, { dryRun: true });
      const p = preview.body.preview as GovernancePreview;
      expect(p.blocked?.code).toBe("required_term");
      expect(p.blocked?.count).toBe(1);
      const refused = await post(`${base()}/terms/${news.id}/retire`, {});
      expect(refused.status).toBe(422);
      expect(refused.body.error).toBe("required_term");
      expect(refused.body.details).toMatchObject({ count: 1 });

      const cloudhal = await term("tag", "cloudhal");
      const tagPreview = await post(`${base()}/terms/${cloudhal.id}/retire`, { dryRun: true });
      expect((tagPreview.body.preview as GovernancePreview).archiveGone).toBe("gone");
      const retired = await post(`${base()}/terms/${cloudhal.id}/retire`, {});
      expect(retired.status).toBe(200);
      expect((await post1()).terms?.tag).toBeUndefined();
    });

    it("move, visibility and review of proposed terms", async () => {
      const news = await term("category", "news");
      const tech = await newTerm("category", "tech");
      const moved = await post(`${base()}/terms/${tech.id}/parent`, { parentId: news.id });
      expect(moved.status).toBe(200);
      expect((moved.body.result as { terms: Term[] }).terms[0]?.parentId).toBe(news.id);
      const cycle = await post(`${base()}/terms/${news.id}/parent`, { parentId: tech.id });
      expect(cycle.status).toBe(422);
      expect(cycle.body.error).toBe("cycle");
      // A tag has no parent.
      const cloudhal = await term("tag", "cloudhal");
      const flat = await post(`${base()}/terms/${cloudhal.id}/parent`, { parentId: news.id });
      expect(flat.status).toBe(422);

      const hidden = await post(`${base()}/terms/${cloudhal.id}/visibility`, {
        visibility: "internal",
        dryRun: true,
      });
      expect((hidden.body.preview as GovernancePreview).archiveGone).toBe("not_found");
      const vis = await post(`${base()}/terms/${cloudhal.id}/visibility`, {
        visibility: "internal",
      });
      expect((vis.body.result as { terms: Term[] }).terms[0]?.visibility).toBe("internal");
      // Nothing to do: no snapshot.
      const same = await post(`${base()}/terms/${cloudhal.id}/visibility`, {
        visibility: "internal",
      });
      expect(same.body.snapshot).toBeNull();

      const llm = await newTerm("tag", "llm", { status: "proposed", proposedBy: agent });
      const llms = await newTerm("tag", "llms", { status: "proposed", proposedBy: agent });
      const spam = await newTerm("tag", "spam", { status: "proposed", proposedBy: agent });
      const approved = await post(`${base()}/terms/${llm.id}/review`, { decision: "approve" });
      expect((approved.body.result as { terms: Term[] }).terms[0]?.status).toBe("active");
      const merged = await post(`${base()}/terms/${llms.id}/review`, {
        decision: "merge",
        into: llm.id,
      });
      expect(merged.status).toBe(200);
      expect((await store.getTerm(llms.id))?.mergedInto).toBe(llm.id);
      const rejected = await post(`${base()}/terms/${spam.id}/review`, { decision: "reject" });
      expect(rejected.status).toBe(200);
      expect((await store.getTerm(spam.id))?.status).toBe("retired");
      const again = await post(`${base()}/terms/${llm.id}/review`, { decision: "approve" });
      expect(again.status).toBe(422);
      expect(again.body.error).toBe("invalid_status");
      expect((await post(`${base()}/terms/${llm.id}/review`, { decision: "?" })).status).toBe(400);
    });

    it("entries: filter language, 400 with suggestions, the %2B hint; required category is 422, not 500", async () => {
      const r = await call(`${base()}/entries?filter=${encodeURIComponent("category:news")}`);
      expect((r.body as unknown as ContentEntry[]).map((e) => e.slug)).toEqual(["hello-world"]);
      const both = await call(
        `${base()}/entries?filter=${encodeURIComponent("category:news+tag:cloudhal")}`,
      );
      expect(both.body as unknown as ContentEntry[]).toHaveLength(1);
      const none = await call(`${base()}/entries?filter=${encodeURIComponent("-tag:cloudhal")}`);
      expect(none.body).toEqual([]);
      const unknown = await call(`${base()}/entries?filter=tag:cloudhall`);
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toBe("unknown_term");
      const details = unknown.body.details as { unknown: { suggestions: { slug: string }[] }[] };
      expect(details.unknown[0]?.suggestions[0]?.slug).toBe("cloudhal");
      const spaced = await call(`${base()}/entries?filter=category:news+tag:cloudhal`);
      expect(spaced.status).toBe(400);
      expect(String(spaced.body.message)).toContain("%2B");

      const entry = await post1();
      const { category: _c, ...rest } = entry.terms ?? {};
      const res = await put(`${base()}/entries/${entry.id}`, {
        ...entry,
        terms: rest,
      });
      expect(res.status).toBe(422);
      expect(res.body.error).toBe("required_term");
      expect(res.body.details).toEqual({ taxonomy: "category" });
    });

    it("redirects: manual CRUD with one snapshot each, served paths 422, duplicates 409", async () => {
      const before = await snapshotCount();
      const created = await post(`${base()}/redirects`, {
        from: "/old-about",
        to: "/about",
        status: 302,
        match: "exact",
        reason: "slug-change",
      });
      expect(created.status).toBe(201);
      const r = created.body.redirect as Redirect;
      expect(r.reason).toBe("manual");
      expect(r.status).toBe(302);
      expect(await snapshotCount()).toBe(before + 1);
      const served = await post(`${base()}/redirects`, {
        from: "/about",
        to: "/",
        status: 301,
        match: "exact",
      });
      expect(served.status).toBe(422);
      expect(served.body.error).toBe("invalid_redirect");
      const dup = await post(`${base()}/redirects`, {
        from: "/old-about",
        to: "/",
        status: 301,
        match: "exact",
      });
      expect(dup.status).toBe(409);
      const external = await post(`${base()}/redirects`, {
        from: "/docs",
        to: "https://docs.example.com/start",
        status: 301,
        match: "prefix",
      });
      expect(external.status).toBe(201);
      const bad = await post(`${base()}/redirects`, {
        from: "/x",
        to: "//evil.example",
        status: 301,
        match: "exact",
      });
      expect(bad.status).toBe(400);
      expect(bad.body.error).toBe("validation");

      const updated = await put(`${base()}/redirects/${r.id}`, { ...r, status: 301 });
      expect(updated.status).toBe(200);
      expect((updated.body.redirect as Redirect).status).toBe(301);
      const fromEdit = await put(`${base()}/redirects/${r.id}`, {
        ...(updated.body.redirect as Redirect),
        from: "/elsewhere",
      });
      expect(fromEdit.status).toBe(400);
      const list = await call(`${base()}/redirects`);
      expect((list.body as unknown as Redirect[]).map((x) => x.from).sort()).toEqual([
        "/docs",
        "/old-about",
      ]);
      const del = await call(`${base()}/redirects/${r.id}?rev=1`, { method: "DELETE" });
      expect(del.status).toBe(200);
      expect(del.body.snapshot).toBeTruthy();
      expect((await call(`${base()}/redirects/${r.id}`)).status).toBe(404);
    });

    it("tags-to-terms migration: dry run writes nothing, run, revert", async () => {
      // A site from before RFC-0002: no taxonomies, tags on entries.
      const project = await store.createProject({
        name: "Old",
        slug: "old",
        ownerId: human.id,
        siteIds: [],
      });
      const old = await store.createSite({
        projectId: project.id,
        name: "Old",
        slug: "old",
        defaultLocale: "en",
        locales: ["en"],
        domains: [],
        pageIds: [],
        theme: { name: "blog" },
      });
      const entry = await store.createContentEntry({
        siteId: old.id,
        collection: "posts",
        slug: "legacy",
        locale: "en",
        status: "draft",
        title: "Legacy",
        body: { format: "markdown", value: "" },
        fields: {},
        tags: ["machine-learning", "ai"],
        author: human,
      });
      const url = `/api/sites/${old.id}/migrations/tags-to-terms`;
      const dry = await post(url, { dryRun: true });
      expect(dry.status).toBe(200);
      expect(dry.body).toMatchObject({
        dryRun: true,
        entries: 1,
        tags: ["ai", "machine-learning"],
      });
      expect(await store.listTaxonomies(old.id)).toEqual([]);
      const run = await post(url, {});
      expect(run.status).toBe(200);
      const migrationId = run.body.migrationId as string;
      expect(migrationId).toBeTruthy();
      const migrated = (await store.getContentEntry(entry.id)) as ContentEntry;
      expect(migrated.tags).toEqual([]);
      expect(migrated.terms?.tag?.ids).toHaveLength(2);
      const terms = await call(`/api/sites/${old.id}/terms?taxonomy=tag`);
      expect((terms.body.items as { term: Term }[]).map((i) => i.term.slug).sort()).toEqual([
        "ai",
        "machine-learning",
      ]);
      expect((await post(`${url}/revert`, {})).status).toBe(400);
      const reverted = await post(`${url}/revert`, { migrationId });
      expect(reverted.status).toBe(200);
      expect(reverted.body.restored).toBe(1);
      expect(((await store.getContentEntry(entry.id)) as ContentEntry).tags).toEqual([
        "machine-learning",
        "ai",
      ]);
    });

    it("snapshot diff reports term assignment deltas per entry", async () => {
      const first = await store.createSnapshot(siteId, { actor: human, reason: "manual" });
      const cms = await newTerm("tag", "cms");
      const entry = await post1();
      await store.updateContentEntry({
        ...entry,
        terms: { ...entry.terms, tag: { ids: [cms.id] } },
      });
      const second = await store.createSnapshot(siteId, { actor: human, reason: "manual" });
      const diff = await call(`${base()}/snapshots/${first.id}/diff/${second.id}?assignments=1`);
      const cloudhal = await term("tag", "cloudhal");
      expect(diff.body.assignments).toEqual([
        { entryId: entry.id, taxonomy: "tag", added: [cms.id], removed: [cloudhal.id] },
      ]);
      const plain = await call(`${base()}/snapshots/${first.id}/diff/${second.id}`);
      expect(plain.body.assignments).toBeUndefined();
    });
  });
}
