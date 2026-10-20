import { describe, expect, it } from "vitest";
import { FetcherBlobStore } from "../src/blob/fetcher.ts";
import { LayeredBlobStore } from "../src/blob/layered.ts";
import { MemoryBlobStore } from "../src/blob/memory.ts";
import { SqlBlobStore } from "../src/blob/sql.ts";
import { BetterSqlite3Driver } from "../src/sql/better-sqlite3.ts";
import { describeBlobStoreConformance } from "../src/testing.ts";
import { StorageError, StorageLimitError, sha256OfBytes } from "../src/types.ts";

const enc = new TextEncoder();
const dec = new TextDecoder();

describeBlobStoreConformance("sql over better-sqlite3", {
  create: async () => new SqlBlobStore(await BetterSqlite3Driver.open(":memory:")),
});

describeBlobStoreConformance("layered (memory over empty memory)", {
  create: async () => new LayeredBlobStore(new MemoryBlobStore(), new MemoryBlobStore()),
});

/** A stand-in for the Worker's ASSETS binding. */
function assets(files: Record<string, { body: string; type?: string }>) {
  const calls: string[] = [];
  return {
    calls,
    async fetch(input: string) {
      const path = new URL(input).pathname.slice(1);
      calls.push(path);
      const f = files[path];
      if (!f) return new Response("not found", { status: 404 });
      return new Response(f.body, { headers: f.type ? { "content-type": f.type } : {} });
    },
  };
}

describe("SqlBlobStore caps", () => {
  it("refuses an object over maxObjectBytes and a put past maxBytes; overwrites count once", async () => {
    const store = new SqlBlobStore(await BetterSqlite3Driver.open(":memory:"), {
      maxBytes: 10,
      maxObjectBytes: 6,
    });
    await expect(store.put("a", new Uint8Array(7))).rejects.toThrow(StorageLimitError);
    await store.put("a", new Uint8Array(6));
    await store.put("b", new Uint8Array(4));
    await expect(store.put("c", new Uint8Array(1))).rejects.toThrow(StorageLimitError);
    expect(await store.head("c")).toBeNull();
    await store.put("a", new Uint8Array(5)); // replaces 6 bytes: 9 in all
    expect(await store.totalBytes()).toBe(9);
    await store.delete("b");
    await store.put("c", new Uint8Array(4));
    expect(await store.list()).toEqual(["a", "c"]);
  });

  it("records the SHA-256 of every object", async () => {
    const store = new SqlBlobStore(await BetterSqlite3Driver.open(":memory:"));
    const data = enc.encode("hello");
    await store.put("h", data, { contentType: "text/plain" });
    expect(await store.head("h")).toEqual({
      size: 5,
      contentType: "text/plain",
      sha256: await sha256OfBytes(data),
    });
  });

  it("lists by prefix without LIKE wildcards leaking", async () => {
    const store = new SqlBlobStore(await BetterSqlite3Driver.open(":memory:"));
    for (const k of ["a_b/1", "axb/1", "a_b2"]) await store.put(k, enc.encode(k));
    expect(await store.list("a_b/")).toEqual(["a_b/1"]);
  });
});

describe("FetcherBlobStore", () => {
  const files = {
    "demo/media/a.png": { body: "PNG", type: "image/png" },
    "demo/media/b.txt": { body: "text" },
  };

  it("reads static files under its prefix; missing is null", async () => {
    const fetcher = assets(files);
    const store = new FetcherBlobStore(fetcher, "demo/", { keys: ["media/b.txt", "media/a.png"] });
    expect(dec.decode((await store.get("media/a.png")) as Uint8Array)).toBe("PNG");
    expect(await store.head("media/a.png")).toEqual({
      size: 3,
      contentType: "image/png",
      sha256: await sha256OfBytes(enc.encode("PNG")),
    });
    expect(await store.get("media/none")).toBeNull();
    expect(await store.head("media/none")).toBeNull();
    expect(await store.list("media/")).toEqual(["media/a.png", "media/b.txt"]);
    expect(fetcher.calls[0]).toBe("demo/media/a.png");
  });

  it("is read-only and checks keys before fetching", async () => {
    const fetcher = assets(files);
    const store = new FetcherBlobStore(fetcher, "demo/");
    await expect(store.put("x")).rejects.toThrow(StorageError);
    await expect(store.delete("media/a.png")).rejects.toThrow(StorageError);
    await expect(store.get("../secret")).rejects.toThrow(StorageError);
    expect(fetcher.calls).toEqual([]);
  });

  it("reports other failures as StorageError", async () => {
    const store = new FetcherBlobStore(
      { fetch: async () => new Response("", { status: 500 }) },
      "",
    );
    await expect(store.get("a")).rejects.toThrow(StorageError);
  });
});

describe("LayeredBlobStore", () => {
  it("reads upper over base, writes to upper, merges lists and keeps base objects on delete", async () => {
    const base = new FetcherBlobStore(
      assets({ "demo/media/a": { body: "base-a" }, "demo/media/b": { body: "base-b" } }),
      "demo/",
      {
        keys: ["media/a", "media/b"],
      },
    );
    const upper = new MemoryBlobStore();
    const store = new LayeredBlobStore(base, upper);
    expect(dec.decode((await store.get("media/a")) as Uint8Array)).toBe("base-a");
    await store.put("media/a", enc.encode("mine"));
    await store.put("nodes/n.json", enc.encode("{}"));
    expect(dec.decode((await store.get("media/a")) as Uint8Array)).toBe("mine");
    expect(await upper.list()).toEqual(["media/a", "nodes/n.json"]);
    expect(await store.list()).toEqual(["media/a", "media/b", "nodes/n.json"]);
    expect(await store.list("media/")).toEqual(["media/a", "media/b"]);
    await store.delete("media/a");
    expect(dec.decode((await store.get("media/a")) as Uint8Array)).toBe("base-a");
    const stream = await store.getStream("media/b", { range: { suffix: 1 } });
    expect(dec.decode(await new Response(stream?.body).arrayBuffer())).toBe("b");
    expect(await store.getStream("media/none")).toBeNull();
  });
});
