/**
 * RFC-0041 §9: typed fields for themes. `entryFields` resolves (§5 localization), labels, formats
 * and makes values safe to draw; live and snapshot sources agree. `EntryFields.astro` is covered
 * by the CLI's starter build (`packages/cli/test/e2e.test.ts`).
 */
import type {
  Actor,
  ContentEntry,
  FieldDefinition,
  Site,
  Translation,
} from "@cloudhal/core-contracts";
import { SiteGraphStore } from "@cloudhal/core-ts";
import { makeJpeg } from "@cloudhal/core-ts/media/fixtures";
import { MemoryBlobStore } from "@cloudhal/storage";
import { BetterSqlite3Driver } from "@cloudhal/storage/sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import {
  entryFields,
  formatFieldValue,
  hasShownFields,
  type RenderedFields,
  renderFields,
  resolveFields,
} from "../src/fields.ts";
import * as root from "../src/index.ts";
import { LiveSource, SnapshotSource } from "../src/source.ts";

const person: Actor = { kind: "human", id: "user_01HZX8K3Q9CD", name: "Halil" };
const L = (en: string, tr?: string) => ({
  en: { label: en },
  ...(tr ? { tr: { label: tr } } : {}),
});

const FIELDS: [FieldDefinition, ...FieldDefinition[]] = [
  { key: "venue", type: "text", labels: L("Venue", "Mekan"), localized: true },
  { key: "notes", type: "text", labels: L("Notes"), localized: true, multiline: true },
  { key: "price", type: "number", labels: L("Price", "Fiyat"), localized: false },
  { key: "online", type: "boolean", labels: L("Online"), localized: false },
  { key: "deadline", type: "date", labels: L("Deadline"), localized: false },
  { key: "startsAt", type: "datetime", labels: L("Starts"), localized: false },
  { key: "ticketUrl", type: "url", labels: L("Tickets"), localized: true },
  { key: "poster", type: "image", labels: L("Poster"), localized: false },
  { key: "agenda", type: "richText", labels: L("Agenda"), localized: true },
  {
    key: "format",
    type: "select",
    labels: L("Format"),
    localized: false,
    multiple: true,
    options: [
      { value: "talk", labels: { en: "Talk", tr: "Konuşma" } },
      { value: "workshop", labels: { en: "Workshop", tr: "Atölye" } },
    ],
  },
];
const STARTS = { at: "2026-11-05T16:30:00Z", timeZone: "Europe/Istanbul" };

const textOf = (f: RenderedFields) =>
  Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.empty ? null : v.text]));

describe("entryFields", () => {
  let store: SiteGraphStore;
  let site: Site;
  let posterId: string;

  const entry = (extra: Partial<ContentEntry>) =>
    store.createContentEntry({
      siteId: site.id,
      collection: "events",
      slug: "launch",
      locale: "en",
      status: "published",
      title: "Launch",
      body: { format: "markdown", value: "Body" },
      fields: {},
      tags: [],
      author: person,
      ...extra,
    } as never) as Promise<ContentEntry>;

  async function translate(original: ContentEntry, fields: Record<string, unknown>) {
    const member = (await store.translationGroup(site, original.id)).members.find(
      (m) => m.id === original.id,
    );
    const translation = {
      group: original.id,
      method: "human",
      source: { id: original.id, locale: "en", rev: original.rev, hash: member?.hash as string },
    } as Translation;
    return entry({ locale: "tr", translation, fields });
  }

  beforeEach(async () => {
    store = new SiteGraphStore({
      sql: await BetterSqlite3Driver.open(":memory:"),
      blobs: new MemoryBlobStore(),
    });
    await store.init();
    const project = await store.createProject({
      name: "Fields",
      slug: "fields",
      ownerId: person.id,
      siteIds: [],
    });
    site = await store.createSite({
      projectId: project.id,
      name: "Fields",
      slug: "fields",
      defaultLocale: "en",
      locales: ["en", "tr"],
      domains: [],
      pageIds: [],
      theme: { name: "blog" },
      collections: { posts: {}, events: { fields: FIELDS } },
    });
    const { asset } = await store.ingestAsset({
      siteId: site.id,
      bytes: makeJpeg({ width: 40, height: 30 }),
      filename: "poster.jpg",
      uploadedBy: person,
      source: { kind: "upload" },
    });
    posterId = (await store.updateAsset({ ...asset, alt: { en: "The poster", tr: "Afiş" } })).id;
  });

  const full = () => ({
    venue: "Kadıköy Hall",
    notes: "Doors at 7\nBring ID",
    price: 1234.5,
    online: false,
    deadline: "2026-02-28",
    startsAt: STARTS,
    ticketUrl: "https://example.com/tickets",
    poster: posterId,
    agenda: "## Plan\n\n- Talks\n- **Lunch**",
    format: ["talk", "workshop"],
  });

  it("formats every type in the entry's language, in definition order", async () => {
    const e = await entry({ fields: full() });
    const f = await new LiveSource(store, site.id).entryFields(e);
    expect(Object.keys(f)).toEqual(FIELDS.map((d) => d.key));
    expect(textOf(f)).toMatchObject({
      venue: "Kadıköy Hall",
      notes: "Doors at 7\nBring ID",
      price: "1,234.5",
      online: "No",
      deadline: "February 28, 2026",
      ticketUrl: "https://example.com/tickets",
      poster: "The poster",
      format: "Talk and Workshop",
    });
    expect(f.startsAt?.text).toMatch(/November 5, 2026.* 7:30\sPM GMT\+3/);
    expect(f.startsAt?.datetime).toBe(STARTS.at);
    expect(f.deadline?.datetime).toBe("2026-02-28");
    expect(f.venue?.label).toBe("Venue");
    expect(f.agenda?.html).toContain('<h2 id="plan">Plan</h2>');
    expect(f.agenda?.html).toContain("<strong>Lunch</strong>");
    expect(f.ticketUrl?.href).toBe("https://example.com/tickets");
    expect(f.poster?.image).toMatchObject({ assetId: posterId, alt: "The poster", width: 40 });
    expect(f.poster?.image?.src).toMatch(/^\/media\//);
    expect(hasShownFields(f)).toBe(true);
  });

  it("is {} for collections without definitions, and skips empty values", async () => {
    const post = await entry({ collection: "posts", fields: { anything: 1 } });
    const live = new LiveSource(store, site.id);
    expect(await live.entryFields(post)).toEqual({});
    const sparse = await entry({ slug: "sparse", fields: { venue: "  " } });
    const f = await live.entryFields(sparse);
    expect(Object.values(f).every((x) => x.empty && x.text === "")).toBe(true);
    expect(hasShownFields(f)).toBe(false);
  });

  it("drops unsafe values: script in rich text is escaped, javascript: links never render", async () => {
    const e = await entry({
      fields: {
        agenda:
          '<script>alert(1)</script>\n\n[x](javascript:alert(1)) <img src=x onerror="alert(1)">',
        ticketUrl: "/tickets",
      },
    });
    const f = await new LiveSource(store, site.id).entryFields(e);
    const html = f.agenda?.html ?? "";
    expect(html).not.toMatch(/<script|<img|href="javascript/i);
    expect(html).toContain("&lt;img src=x onerror="); // raw HTML is text, never markup
    // Values are checked on write; a stored unsafe URL (an import, an old value) is dropped here.
    const resolved = resolveFields(site, e);
    const def = resolved.ticketUrl?.def as FieldDefinition;
    resolved.ticketUrl = { def, value: "java\tscript:alert(1)", fromOriginal: false };
    const unsafe = renderFields(resolved, { locale: "en", defaultLocale: "en" });
    expect(unsafe.ticketUrl).toMatchObject({ empty: true, text: "", value: undefined });
    expect(unsafe.ticketUrl?.href).toBeUndefined();
    expect(f.ticketUrl?.href).toBe("/tickets");
  });

  it("a translation: localized values its own or the original's, the rest from the original", async () => {
    const original = await entry({ fields: full() });
    const tr = await translate(original, { venue: "Kadıköy Salonu" });
    const f = await new LiveSource(store, site.id).entryFields(tr);
    expect(f.venue).toMatchObject({ text: "Kadıköy Salonu", fromOriginal: false, label: "Mekan" });
    // Localized and empty here: the original's (RFC-0041 §5, `fromOriginal`).
    expect(f.ticketUrl).toMatchObject({ href: "https://example.com/tickets", fromOriginal: true });
    // Non-localized: always the original's, formatted for the translation's language.
    expect(f.price).toMatchObject({ text: "1.234,5", fromOriginal: true, label: "Fiyat" });
    expect(f.format?.text).toBe("Konuşma ve Atölye");
    expect(f.poster?.image?.alt).toBe("Afiş");
    expect(f.deadline?.text).toBe("28 Şubat 2026");
  });

  it("a language edition (original in another site) owns all its values", async () => {
    const original = await entry({ fields: full() });
    // Stored as a translation of an entry in another site of the project (RFC-0034): the
    // source never reads that original, even when asked for one by id.
    const edition = {
      ...original,
      id: "entry_01HZX8K3Q9ED",
      locale: "tr",
      fields: { price: 9 },
      translation: {
        group: original.id,
        method: "human",
        source: {
          id: original.id,
          siteId: "site_01HZX8K3Q9XX",
          locale: "en",
          rev: 1,
          hash: "a".repeat(64),
        },
      } as Translation,
    } as ContentEntry;
    let asked = 0;
    const f = await entryFields(
      {
        site: async () => site,
        entryById: async () => {
          asked++;
          return original;
        },
      },
      edition,
    );
    expect(asked).toBe(0);
    expect(f.price).toMatchObject({ text: "9", fromOriginal: false });
    expect(f.venue?.empty).toBe(true);
  });

  it("live and snapshot sources give the same fields", async () => {
    const original = await entry({ fields: full() });
    const tr = await translate(original, { notes: "Kapılar 7'de" });
    const snap = await store.createSnapshot(site.id, {
      actor: { kind: "system", id: "sys_test0001" },
      reason: "manual",
    });
    const live = new LiveSource(store, site.id, { includeDrafts: false });
    const frozen = await SnapshotSource.open(store, snap.id);
    for (const e of [original, tr]) {
      const a = await live.entryFields(e, { locale: e.locale });
      const b = await frozen.entryFields(e, { locale: e.locale });
      expect(b).toEqual(a);
    }
    // The standalone function works with any source shape (and the page's media context).
    const media = { assets: new Map((await live.assets()).map((x) => [x.id, x])) };
    expect(await entryFields(frozen, tr, { media })).toEqual(await frozen.entryFields(tr));
  });

  it("re-exports the field helpers themes import from the renderer", () => {
    expect(root.resolveFields).toBe(resolveFields);
    expect(root.formatFieldValue).toBe(formatFieldValue);
    expect(typeof root.fieldLabel).toBe("function");
    expect(typeof root.optionLabel).toBe("function");
    expect(typeof root.entryFields).toBe("function");
  });
});
