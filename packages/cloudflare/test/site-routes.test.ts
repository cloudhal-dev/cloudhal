import { describe, expect, it } from "vitest";
import { attachedSite, bindingFor, routedSite } from "../src/site-routes.ts";

const worker = (name: string, seen: string[]) =>
  ({
    fetch: async () => {
      seen.push(name);
      return new Response(name);
    },
  }) as unknown as Fetcher;

describe("site routes (RFC-0034 §4)", () => {
  it("sends each purge to the Worker of the site in its body", async () => {
    const seen: string[] = [];
    const env = {
      SITE: worker("main", seen),
      SITE_1: worker("docs", seen),
      CLOUDHAL_SITE_ROUTES: JSON.stringify({ site_docs00001: "SITE_1" }),
    };
    const routed = routedSite(env) as Fetcher;
    const purge = (body?: unknown) =>
      routed.fetch("https://site.internal/__cloudhal/purge", {
        method: "POST",
        ...(body ? { body: JSON.stringify(body) } : {}),
      } as never);
    await purge({ siteId: "site_docs00001", tags: ["cloudhal-node-1"] });
    await purge({ siteId: "site_english01" });
    await purge();
    expect(seen).toEqual(["docs", "main", "main"]);
    expect(attachedSite(env, "site_docs00001")).toBe(true);
    expect(attachedSite(env, "site_english01")).toBe(false);
  });

  it("falls back to SITE for a route whose binding is missing, and to nothing without Workers", () => {
    const seen: string[] = [];
    const main = worker("main", seen);
    expect(bindingFor({ SITE: main, CLOUDHAL_SITE_ROUTES: '{"site_x":"SITE_9"}' }, "site_x")).toBe(
      main,
    );
    expect(routedSite({})).toBeUndefined();
  });
});
