import type {
  Asset,
  ContentEntry,
  Menu,
  Page,
  Redirect,
  Site,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import type { RedirectMatch, SearchResults, SiteGraphStore } from "@cloudhal/core-ts";
import { searchDocuments, searchRows } from "@cloudhal/core-ts";
import { isAvailable, nextInstant } from "@cloudhal/core-ts/availability";
import { derivedGates, hasExpiryRules } from "@cloudhal/core-ts/fields";
import { matches } from "@cloudhal/core-ts/filter";
import {
  evaluateEntryQuery,
  type FieldEntryQuery,
  type FieldEntryResult,
  rememberList,
} from "./entry-query.ts";
import { type EntrySplit, gateIndex, splitEntries } from "./entry-views.ts";
import { type EntryFieldsOptions, entryFields, type RenderedFields } from "./fields.ts";
import { type Navigation, type NavigationOptions, navigationFor } from "./navigation.ts";
import type { GraphSource, SourceSearchOptions } from "./source.ts";
import { byNewest, byPosition, compile, shown, termFilter, visible } from "./source-helpers.ts";

/**
 * Reads the current nodes on every call. Drafts are included so authors can preview them in dev,
 * and so are gated nodes (a preview shows embargoed and expired content, RFC-0008 §7.3). Without
 * drafts it serves what the public would see: published nodes whose gates are open at `now`.
 */
export class LiveSource implements GraphSource {
  readonly mode = "live";
  readonly #store: SiteGraphStore;
  readonly #siteId: string;
  readonly #includeDrafts: boolean;
  readonly #now: () => number;

  constructor(
    store: SiteGraphStore,
    siteId: string,
    options: { includeDrafts?: boolean; now?: () => number } = {},
  ) {
    this.#store = store;
    this.#siteId = siteId;
    this.#includeDrafts = options.includeDrafts ?? true;
    this.#now = options.now ?? Date.now;
  }

  /** Drafts and gated nodes, or what the public sees now. */
  #visible<T extends Page | ContentEntry>(nodes: T[]): T[] {
    if (this.#includeDrafts) return visible(nodes, true);
    const now = this.#now();
    return nodes.filter((n) => isAvailable(n, now));
  }

  /**
   * Entries as the public sees them now, derived gates included (RFC-0042 §3): `listed` for lists,
   * `reachable` for routes. With drafts both are everything not archived (previews ignore gates).
   */
  async #split(
    entries: ContentEntry[],
    /** Every entry of the site, when the caller already read them (the pool for originals). */
    all?: ContentEntry[],
  ): Promise<EntrySplit & { published: ContentEntry[] }> {
    if (this.#includeDrafts) {
      const all = visible(entries, true);
      return { listed: all, reachable: all, published: all };
    }
    const site = await this.site();
    const isPublished = (e: ContentEntry) => e.status === "published";
    // Translations read their original's date, which may sit in another locale or collection.
    const pool = !hasExpiryRules(site)
      ? entries
      : (all ?? (await this.#store.listContentEntries(this.#siteId)));
    const published = pool.filter(isPublished);
    const derived = derivedGates(site, published);
    return { ...splitEntries(entries.filter(isPublished), this.#now(), derived), published };
  }

  async nextGate(): Promise<number | undefined> {
    if (this.#includeDrafts) return undefined;
    const [site, pages, entries] = await Promise.all([
      this.site(),
      this.#store.listPages(this.#siteId),
      this.#store.listContentEntries(this.#siteId),
    ]);
    const isPublished = (n: Page | ContentEntry) => n.status === "published";
    const gates = gateIndex(site, pages.filter(isPublished), entries.filter(isPublished));
    return nextInstant(gates, this.#now());
  }

  async site(): Promise<Site> {
    const site = await this.#store.getSite(this.#siteId);
    if (!site) throw new Error(`site ${this.#siteId} not found`);
    return site;
  }

  async pages(): Promise<Page[]> {
    const site = await this.site();
    const pages = this.#visible(await this.#store.listPages(this.#siteId));
    const order = new Map(site.pageIds.map((id, i) => [id, i]));
    return pages.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }

  async pageByPath(path: string, locale?: string): Promise<Page | undefined> {
    const loc = locale ?? (await this.site()).defaultLocale;
    return (await this.pages()).find((p) => p.path === path && p.locale === loc);
  }

  async entries(collection: string, locale?: string): Promise<ContentEntry[]> {
    const loc = locale ?? (await this.site()).defaultLocale;
    const { listed } = await this.#split(
      await this.#store.listContentEntries(this.#siteId, collection),
    );
    const out = listed.filter((e) => e.locale === loc).sort(byNewest);
    return rememberList(out, { source: this, locale: loc });
  }

  async entryBySlug(
    collection: string,
    slug: string,
    locale?: string,
  ): Promise<ContentEntry | undefined> {
    const loc = locale ?? (await this.site()).defaultLocale;
    const { reachable } = await this.#split(
      await this.#store.listContentEntries(this.#siteId, collection),
    );
    return reachable.find((e) => e.slug === slug && e.locale === loc);
  }

  async allEntries(locale?: string): Promise<ContentEntry[]> {
    const loc = locale ?? (await this.site()).defaultLocale;
    const all = await this.#store.listContentEntries(this.#siteId);
    const { listed } = await this.#split(all, all);
    return listed.filter((e) => e.locale === loc).sort(byNewest);
  }

  /** Every entry of a locale with a public URL, unlisted ones included (RFC-0042 §3). */
  async routableEntries(locale?: string): Promise<ContentEntry[]> {
    const loc = locale ?? (await this.site()).defaultLocale;
    const all = await this.#store.listContentEntries(this.#siteId);
    const { reachable } = await this.#split(all, all);
    return reachable.filter((e) => e.locale === loc).sort(byNewest);
  }

  /** RFC-0042 §4: a collection by its list fields (`queryEntries`). */
  async queryEntries(q: FieldEntryQuery): Promise<FieldEntryResult> {
    const site = await this.site();
    const loc = q.locale ?? site.defaultLocale;
    // With expiry rules every entry is read once (originals may sit elsewhere); else the collection.
    const all = hasExpiryRules(site)
      ? await this.#store.listContentEntries(this.#siteId)
      : undefined;
    const mine = all
      ? all.filter((e) => e.collection === q.collection)
      : await this.#store.listContentEntries(this.#siteId, q.collection);
    const [split, taxonomies, terms] = await Promise.all([
      this.#split(mine, all),
      this.#store.listTaxonomies(this.#siteId),
      this.#store.listTerms(this.#siteId),
    ]);
    const shownHere = q.includeExpired ? split.reachable : split.listed;
    return evaluateEntryQuery({
      site,
      candidates: shownHere.filter((e) => e.locale === loc),
      published: split.published,
      taxonomies,
      terms,
      query: q,
      now: this.#now(),
    });
  }

  async search(query: string, options: SourceSearchOptions = {}): Promise<SearchResults> {
    const site = await this.site();
    const locale = options.locale ?? site.defaultLocale;
    // What this source shows decided visibility and gates already (drafts included).
    const [entries, pages, taxonomies, terms] = await Promise.all([
      this.allEntries(locale),
      this.pages(),
      this.taxonomies(),
      this.vocabulary(),
    ]);
    const rows = searchDocuments({
      locales: [locale],
      defaultLocale: site.defaultLocale,
      site,
      entries,
      pages: pages.filter((p) => p.locale === locale),
      taxonomies,
      terms,
      drafts: true,
    }).map((r) => ({ ...r, gateFrom: undefined, gateUntil: undefined }));
    return searchRows(rows, query, { ...options, locale, now: this.#now() });
  }

  async entryById(id: string): Promise<ContentEntry | undefined> {
    const entry = await this.#store.getContentEntry(id);
    if (!entry || entry.siteId !== this.#siteId) return undefined;
    return (await this.#split([entry])).reachable.length > 0 ? entry : undefined;
  }

  entryFields(entry: ContentEntry, options?: EntryFieldsOptions): Promise<RenderedFields> {
    return entryFields(this, entry, options);
  }

  taxonomies(): Promise<Taxonomy[]> {
    return this.#store.listTaxonomies(this.#siteId);
  }

  async terms(key: string): Promise<Term[]> {
    const loc = (await this.site()).defaultLocale;
    return (await this.#store.listTerms(this.#siteId, { taxonomy: key }))
      .filter((t) => shown(t, this.#includeDrafts))
      .sort(byPosition(loc));
  }

  async termBySlug(key: string, slug: string): Promise<Term | undefined> {
    return (await this.terms(key)).find((t) => t.slug === slug);
  }

  vocabulary(key?: string): Promise<Term[]> {
    return this.#store.listTerms(this.#siteId, key === undefined ? {} : { taxonomy: key });
  }

  async entriesByFilter(
    filter: string,
    options: { locale?: string; limit?: number } = {},
  ): Promise<ContentEntry[]> {
    const loc = options.locale ?? (await this.site()).defaultLocale;
    const [taxonomies, terms, entries] = await Promise.all([
      this.#store.listTaxonomies(this.#siteId),
      this.#store.listTerms(this.#siteId),
      this.#store.listContentEntries(this.#siteId, { locale: loc }),
    ]);
    const f = compile(filter, taxonomies, terms);
    const out = (await this.#split(entries)).listed.filter((e) => matches(f, e)).sort(byNewest);
    return rememberList(options.limit === undefined ? out : out.slice(0, options.limit), {
      source: this,
      locale: loc,
    });
  }

  entriesByTerm(
    key: string,
    slug: string,
    options: { locale?: string; limit?: number; descendants?: boolean } = {},
  ): Promise<ContentEntry[]> {
    return this.entriesByFilter(termFilter(key, slug, options.descendants === true), options);
  }

  redirectFor(path: string, locale?: string): Promise<RedirectMatch | undefined> {
    return this.#store.redirectFor(this.#siteId, path, locale);
  }

  redirects(): Promise<Redirect[]> {
    return this.#store.listRedirects(this.#siteId);
  }

  menu(key: string): Promise<Menu | undefined> {
    return this.#store.getMenuByKey(this.#siteId, key);
  }

  async navigation(
    key: string,
    locale?: string,
    options: NavigationOptions = {},
  ): Promise<Navigation | undefined> {
    const menu = await this.menu(key);
    if (!menu) return undefined;
    const site = await this.site();
    const [pages, entries, taxonomies, terms] = await Promise.all([
      this.#store.listPages(this.#siteId),
      this.#store.listContentEntries(this.#siteId),
      this.#store.listTaxonomies(this.#siteId),
      this.#store.listTerms(this.#siteId),
    ]);
    return navigationFor(
      menu,
      {
        site,
        // drafts: everything but archived (the lookup decides); public: what is available now
        pages: this.#includeDrafts ? pages : this.#visible(pages),
        entries: this.#includeDrafts ? entries : (await this.#split(entries, entries)).reachable,
        taxonomies,
        terms,
        includeDrafts: this.#includeDrafts,
        ...(options.collectionIndex ? { collectionIndex: options.collectionIndex } : {}),
      },
      locale ?? site.defaultLocale,
    );
  }

  async assets(): Promise<Asset[]> {
    const out: Asset[] = [];
    let cursor: string | undefined;
    do {
      const page = await this.#store.listAssets(this.#siteId, {
        limit: 200,
        ...(cursor ? { cursor } : {}),
      });
      out.push(...page.assets);
      cursor = page.nextCursor;
    } while (cursor);
    return out;
  }

  async asset(id: string): Promise<Asset | undefined> {
    const a = await this.#store.getAsset(id);
    return a?.siteId === this.#siteId ? a : undefined;
  }

  assetByPrefix(prefix16: string): Promise<Asset | undefined> {
    return this.#store.getAssetByPrefix(this.#siteId, prefix16);
  }
}
