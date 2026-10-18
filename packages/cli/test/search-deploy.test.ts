/** RFC-0029 §3: `cloudhal.json` `search` and what it adds to both Workers' configs. */
import { describe, expect, it } from "vitest";
import { adminWorkerConfig, siteWorkerConfig, workerNames } from "../src/cloudflare/config.ts";
import { searchDeploymentOf } from "../src/cloudflare/search.ts";
import { parseSearchConfig } from "../src/config-search.ts";

const names = { name: "news" };
const admin = { ...names, studioDir: "studio", main: "./worker.ts" };
const site = { ...names, siteId: "site_abcdefgh" };

describe("search provider deployment", () => {
  it("reads `search` leniently: a known provider and a valid instance, or nothing", () => {
    expect(
      parseSearchConfig({
        provider: "cloudflare-ai-search",
        instance: "news-search",
        monthlyLimit: 50,
      }),
    ).toEqual({ provider: "cloudflare-ai-search", instance: "news-search", monthlyLimit: 50 });
    expect(parseSearchConfig({ provider: "algolia", instance: "x-y" })).toBeUndefined();
    expect(
      parseSearchConfig({ provider: "cloudflare-ai-search", instance: "Bad Name" }),
    ).toBeUndefined();
    expect(
      parseSearchConfig({
        provider: "cloudflare-ai-search",
        instance: "news-search",
        bucket: "UPPER",
        monthlyLimit: -1,
      }),
    ).toEqual({ provider: "cloudflare-ai-search", instance: "news-search" });
    expect(searchDeploymentOf(undefined, "news")).toBeUndefined();
    expect(
      searchDeploymentOf({ provider: "cloudflare-ai-search", instance: "news-search" }, "news"),
    ).toEqual({ instance: "news-search", bucket: "news-search", monthlyLimit: 1000 });
  });

  it("without it, neither Worker binds AI Search or a second bucket", () => {
    for (const cfg of [siteWorkerConfig(site), adminWorkerConfig(admin)]) {
      expect(cfg).not.toHaveProperty("ai_search");
      expect(cfg.r2_buckets).toEqual([{ binding: "BLOBS", bucket_name: "news-blobs" }]);
      expect(cfg.vars).not.toHaveProperty("CLOUDHAL_SEARCH_PROVIDER");
    }
    expect(workerNames(names)).not.toHaveProperty("searchBucket");
  });

  it("with it, both Workers bind the instance and the bucket and read the same vars", () => {
    const search = { instance: "news-ai", bucket: "news-search", monthlyLimit: 200 };
    for (const cfg of [
      siteWorkerConfig({ ...site, search }),
      adminWorkerConfig({ ...admin, search }),
    ]) {
      expect(cfg.ai_search).toEqual([{ binding: "AI_SEARCH", instance_name: "news-ai" }]);
      expect(cfg.r2_buckets).toEqual([
        { binding: "BLOBS", bucket_name: "news-blobs" },
        { binding: "SEARCH_BUCKET", bucket_name: "news-search" },
      ]);
      expect(cfg.vars).toMatchObject({
        CLOUDHAL_SEARCH_PROVIDER: "cloudflare-ai-search",
        CLOUDHAL_SEARCH_MONTHLY_LIMIT: "200",
      });
    }
    // `cloudhal deploy` creates the bucket with the others
    expect(workerNames({ ...names, search }).searchBucket).toBe("news-search");
  });
});
