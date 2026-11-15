/**
 * Which site a Site Worker serves (RFC-0034 §4), and the RFC-0046 §11b drift guard behind
 * `deploy --release`: a bundle is built with one site id, and the deployment's `CLOUDHAL_SITE_ID`
 * var must override it, or every installed project would serve the CI build's site.
 */
import { describe, expect, it } from "vitest";
import { SiteDispatch, singleSiteId } from "../src/site-dispatch.ts";

const noSql = () => {
  throw new Error("a single-site Worker never reads site_hosts");
};

describe("the Site Worker's site", () => {
  it("serves CLOUDHAL_SITE_ID over the id the bundle was built with", async () => {
    const env = { CLOUDHAL_SITE_ID: "site_project1" };
    expect(singleSiteId(env, "site_ci00build")).toBe("site_project1");
    const d = new SiteDispatch({
      siteId: singleSiteId(env, "site_ci00build"),
      siteIds: undefined,
      sql: noSql,
    });
    expect(await d.choose(new Request("https://anything.example.com/"))).toEqual({
      kind: "site",
      siteId: "site_project1",
    });
  });

  it("falls back to the built id alone, and to none when CLOUDHAL_SITE_IDS makes it multi-site", () => {
    expect(singleSiteId({}, "site_ci00build")).toBe("site_ci00build");
    expect(
      singleSiteId({ CLOUDHAL_SITE_IDS: "site_a00001,site_b00002" }, "site_ci00build"),
    ).toBeUndefined();
    // An explicit single id still wins over the list.
    expect(
      singleSiteId(
        { CLOUDHAL_SITE_ID: "site_a00001", CLOUDHAL_SITE_IDS: "site_b00002" },
        undefined,
      ),
    ).toBe("site_a00001");
  });
});
