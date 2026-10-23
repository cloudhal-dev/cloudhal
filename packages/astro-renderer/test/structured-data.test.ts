/**
 * RFC-0042 §2 in `<head>`: `withStructuredData` swaps the generic `BlogPosting` for a
 * collection's preset when the entry has every required value; `entryHead` is unchanged (old
 * themes), the `BreadcrumbList` stays, output is escaped by `jsonLdText`.
 */
import type { ContentEntry } from "@cloudhal/core-contracts";
import { STRUCTURED_DATA_MAX_BYTES } from "@cloudhal/core-ts/structured-data";
import { beforeAll, describe, expect, it } from "vitest";
import { entryHead, entryStructuredData, jsonLdText, withStructuredData } from "../src/seo.ts";
import { type GraphSource, SnapshotSource } from "../src/source.ts";
import { type Stage3, stage3, T } from "./stage3-fixture.ts";

const ORIGIN = "https://stage3.example";
const types = (docs: object[]) => docs.map((d) => (d as { "@type": string })["@type"]);

describe("withStructuredData (RFC-0042 §2)", () => {
  let fx: Stage3;
  let source: GraphSource;
  beforeAll(async () => {
    fx = await stage3();
    source = (await SnapshotSource.open(fx.store, fx.snapshotId)).at(T);
  });
  const head = async (entry: ContentEntry) => {
    const site = await source.site();
    const base = entryHead(site, entry, ORIGIN);
    return { base, withPreset: await withStructuredData(base, source, entry, { origin: ORIGIN }) };
  };

  it("replaces the BlogPosting with the preset and keeps the BreadcrumbList", async () => {
    const { base, withPreset } = await head(fx.soon);
    expect(types(base.jsonLd)).toEqual(["BlogPosting", "BreadcrumbList"]);
    expect(types(withPreset.jsonLd)).toEqual(["Event", "BreadcrumbList"]);
    expect(withPreset.jsonLd[1]).toBe(base.jsonLd[1]);
    const event = withPreset.jsonLd[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      "@context": "https://schema.org",
      "@type": "Event",
      name: "Gig soon",
      // a datetime gives its instant with its zone's offset
      startDate: "2026-11-05T17:00:00+03:00",
      endDate: "2026-11-05T19:00:00+03:00",
      eventStatus: "https://schema.org/EventScheduled",
      offers: { "@type": "Offer", price: 250, priceCurrency: "TRY" },
    });
    expect(event.location).toMatchObject({
      "@type": "Place",
      address: { "@type": "PostalAddress", addressLocality: "Istanbul" },
    });
    // everything else in the head is entryHead's
    expect({ ...withPreset, jsonLd: [] }).toEqual({ ...base, jsonLd: [] });
  });

  it("escapes values through jsonLdText: no </script> breakout", async () => {
    const { withPreset } = await head(fx.soon);
    const text = jsonLdText(withPreset.jsonLd[0] as object);
    expect(text).not.toContain("</script>");
    expect(text).not.toContain("<");
    expect(text).not.toContain("&");
    expect(text).toContain("\\u003c/script\\u003e");
    expect(JSON.parse(text).location.name).toBe("Kadıköy </script><script>alert(1)</script> & Co");
    expect(text.length).toBeLessThanOrEqual(STRUCTURED_DATA_MAX_BYTES);
  });

  it("keeps the BlogPosting when a required value is missing", async () => {
    const { base, withPreset } = await head(fx.undated);
    expect(withPreset).toBe(base);
    const result = await entryStructuredData(source, fx.undated, { origin: ORIGIN });
    expect(result.doc).toBeUndefined();
    expect(result.issues.map((i) => i.path)).toContain("startDate");
  });

  it("changes nothing for a collection without a preset (and entryHead never changes)", async () => {
    const [hello] = await source.entries("posts");
    if (!hello) throw new Error("seed");
    const { base, withPreset } = await head(hello);
    expect(withPreset).toBe(base);
    expect(types(base.jsonLd)).toEqual(["BlogPosting", "BreadcrumbList"]);
    // an unlisted entry keeps its page and its preset, with dates in the past (Google's way)
    const past = await head(fx.past);
    expect(types(past.withPreset.jsonLd)).toEqual(["Event", "BreadcrumbList"]);
  });
});
