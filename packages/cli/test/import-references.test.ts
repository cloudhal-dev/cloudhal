/** RFC-0045 §2 "Archives", OQ 14: `cloudhal import --dry-run`'s reference warnings. */
import type { SiteBundle } from "@cloudhal/core-ts";
import { describe, expect, it } from "vitest";
import { referenceLines } from "../src/commands/import-references.ts";

const SITE = "site_01HZX8K3Q9AB";
const row = (kind: string, body: Record<string, unknown>) =>
  ({ id: body.id, kind, site_id: SITE, body: JSON.stringify(body) }) as never;
const entry = (id: string, over: Record<string, unknown> = {}) =>
  row("contentEntry", {
    id,
    collection: "events",
    locale: "en",
    status: "published",
    fields: {},
    ...over,
  });

function bundle(collections: unknown, entries: unknown[]): SiteBundle {
  return {
    siteId: SITE,
    nodes: [row("site", { id: SITE, defaultLocale: "en", collections }), ...entries],
  } as unknown as SiteBundle;
}

describe("referenceLines", () => {
  it("names the published references that will show nothing", () => {
    const venue = {
      key: "venue",
      type: "reference",
      labels: { en: { label: "V" } },
      localized: false,
      collections: ["places"],
    };
    const lines = referenceLines(
      bundle({ events: { fields: [venue] }, places: {} }, [
        entry("entry_01HZX8K3QEVT1", { fields: { venue: "entry_01HZX8K3QGONE" } }),
      ]),
      0,
    );
    expect(lines[0]).toMatch(/1 reference\(s\)/);
    expect(lines[1]).toContain("fields/venue → entry_01HZX8K3QGONE: missing");
  });

  it("names relinked originals (OQ 14) and is quiet otherwise", () => {
    const lines = referenceLines(
      bundle({}, [
        entry("entry_01HZX8K3QORIG", {
          translation: { group: "entry_01HZX8K3QOTHR", method: "human" },
        }),
        entry("entry_01HZX8K3QTRAN", {
          locale: "tr",
          translation: { group: "entry_01HZX8K3QORIG", method: "human" },
        }),
      ]),
      0,
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("entry_01HZX8K3QORIG");
    expect(referenceLines(bundle({}, [entry("entry_01HZX8K3QALON")]), 0)).toEqual([]);
  });
});
