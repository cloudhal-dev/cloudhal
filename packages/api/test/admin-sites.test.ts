/** RFC-0034 §2–3: `cloudhal site list|create|delete` behind the deployment token. */
import { SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { describe, expect, it } from "vitest";
import { createApi } from "../src/app.ts";

const TOKEN = "deploy-token-for-tests-0123456789abcdef";

async function setup() {
  const sql = await BetterSqlite3Driver.open(":memory:");
  const blobs = new MemoryBlobStore();
  const store = new SiteGraphStore({ sql, blobs });
  await store.init();
  const first = await seedStarterSite(store, { name: "English", slug: "english" });
  const app = createApi({ store, admin: { deployToken: TOKEN, storage: { sql, blobs } } });
  const call = (method: string, path: string, body?: unknown, token = TOKEN) =>
    app.request(path, {
      method,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  return { store, first, call };
}

describe("admin sites endpoints", () => {
  it("creates a site in the same installation, lists it, and deletes it on confirmation", async () => {
    const { store, first, call } = await setup();
    expect((await call("GET", "/api/admin/sites", undefined, "nope")).status).toBe(401);
    expect(
      (await call("POST", "/api/admin/sites", { name: "Bad", slug: "Not A Slug" })).status,
    ).toBe(400);
    expect((await call("POST", "/api/admin/sites", { name: "Dup", slug: "english" })).status).toBe(
      409,
    );
    expect(
      (
        await call("POST", "/api/admin/sites", {
          name: "X",
          slug: "x",
          projectId: "proj_missing0001",
        })
      ).status,
    ).toBe(404);

    const res = await call("POST", "/api/admin/sites", {
      name: "Türkçe",
      slug: "turkce",
      locale: "tr",
      projectId: first.projectId,
    });
    expect(res.status).toBe(201);
    const { site } = (await res.json()) as { site: { id: string; projectId: string } };
    expect(site.projectId).toBe(first.projectId);
    expect((await store.getSite(site.id))?.defaultLocale).toBe("tr");
    expect((await store.listPages(site.id)).length).toBe(2);
    expect((await store.getSite(site.id))?.publishedSnapshotId).toBeUndefined();

    const listed = (await (await call("GET", "/api/admin/sites")).json()) as {
      sites: { id: string; slug: string; hosts: string[]; conflicts: string[] }[];
    };
    expect(listed.sites.map((s) => s.slug).sort()).toEqual(["english", "turkce"]);

    expect((await call("DELETE", `/api/admin/sites/${site.id}`, { confirm: "nope" })).status).toBe(
      400,
    );
    const del = await call("DELETE", `/api/admin/sites/${site.id}`, { confirm: "turkce" });
    expect(del.status).toBe(200);
    expect(await store.getSite(site.id)).toBeUndefined();
    expect((await store.getProject(first.projectId))?.siteIds).toEqual([first.id]);

    // The last site stays: an installation without sites would serve nothing.
    expect(
      (await call("DELETE", `/api/admin/sites/${first.id}`, { confirm: "english" })).status,
    ).toBe(409);
  });
});
