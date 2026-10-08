import type {
  Asset,
  ContentEntry,
  Menu,
  NodeRef,
  Page,
  Redirect,
  Site,
  Snapshot,
  Taxonomy,
  Term,
} from "@cloudhal/core-contracts";
import type { RedirectMatch, SiteGraphStore } from "@cloudhal/core-ts";
import { matchRedirect, termName } from "@cloudhal/core-ts";
import { matches, parseFilter, resolveFilter } from "@cloudhal/core-ts/filter";
import { type Navigation, type NavigationOptions, navigationFor } from "./navigation.ts";

/**
 * What a renderer needs from a site, independent of whether it reads live nodes (dev) or a
 * published snapshot (build/production).
 */
export interface GraphSource {
  readonly mode: "live" | "snapshot";
  site(): Promise<Site>;
  pages(): Promise<Page[]>;
  pageByPath(path: string, locale?: string): Promise<Page | undefined>;
  entries(collection: string, locale?: string): Promise<ContentEntry[]>;
  entryBySlug(collection: string, slug: string, locale?: string): Promise<ContentEntry | undefined>;
  /** Every visible entry of a locale, newest first, across collections (feeds, sitemaps). */
  allEntries(locale?: string): Promise<ContentEntry[]>;
  /** The site's taxonomies (RFC-0002). */
  taxonomies(): Promise<Taxonomy[]>;
  /**
   * Terms of a taxonomy that may be shown, by `position`, then name. Snapshot mode (and live mode
   * without drafts): active and public only. Live mode with drafts: every non-retired term.
   */
  terms(key: string): Promise<Term[]>;
  /** A shown term by its current slug (old slugs answer with a redirect, not a term). */
  termBySlug(key: string, slug: string): Promise<Term | undefined>;
  /**
   * Every term of a taxonomy (or of the site, without `key`) in any status: proposed, internal and
   * retired terms included. Routes need them to tell a 404 from a 410; never list them publicly.
   */
  vocabulary(key?: string): Promise<Term[]>;
  /**
   * Visible entries matching a filter expression (RFC-0002 §5), newest first. Unknown terms match
   * nothing (a published snapshot must keep rendering) and are logged.
   */
  entriesByFilter(
    filter: string,
    options?: { locale?: string; limit?: number },
  ): Promise<ContentEntry[]>;
  /** Visible entries assigned to a term (with `descendants`, also to its sub-terms), newest first. */
  entriesByTerm(
    key: string,
    slug: string,
    options?: { locale?: string; limit?: number; descendants?: boolean },
  ): Promise<ContentEntry[]>;
  /** The redirect for a request path: exact first, then the longest prefix redirect. */
  redirectFor(path: string): Promise<RedirectMatch | undefined>;
  /** Every redirect of the site (static builds write them out; see `redirectsFile`). */
  redirects(): Promise<Redirect[]>;
  /** The menu stored under `key`, if the site has one (raw node, RFC-0003). */
  menu(key: string): Promise<Menu | undefined>;
  /**
   * The menu under `key` resolved for a locale (default: the site's): only shown items, with labels
   * and hrefs. Undefined: no menu under `key` (themes fall back to `derivedNavigation`).
   */
  navigation(
    key: string,
    locale?: string,
    options?: NavigationOptions,
  ): Promise<Navigation | undefined>;
  /**
   * RFC-0004: every asset this source shows — a snapshot's captured assets, or the site's current
   * ones (any status: retired assets keep rendering where they are used). Optional for sources
   * that predate media.
   */
  assets?(): Promise<Asset[]>;
  /** The asset with this id, if this source shows it. */
  asset?(id: string): Promise<Asset | undefined>;
  /** The asset behind a media URL's 16-hex prefix (the media route). */
  assetByPrefix?(prefix16: string): Promise<Asset | undefined>;
}

function byNewest(a: ContentEntry, b: ContentEntry): number {
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
}

function byPosition(locale: string) {
  return (a: Term, b: Term) =>
    (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER) ||
    termName(a, locale).localeCompare(termName(b, locale)) ||
    a.slug.localeCompare(b.slug);
}

function shown(term: Term, includeDrafts: boolean): boolean {
  return includeDrafts
    ? term.status !== "retired"
    : term.status === "active" && term.visibility === "public";
}

function termFilter(key: string, slug: string, descendants: boolean): string {
  return `${key}:${slug}${descendants ? ">*" : ""}`;
}

/** Resolves a filter against a vocabulary; unknown terms match nothing and are logged. */
function compile(filter: string, taxonomies: Taxonomy[], terms: Term[]) {
  const resolved = resolveFilter(
    parseFilter(filter),
    { taxonomies, terms },
    { unknown: "match-nothing" },
  );
  if (resolved.unknown.length > 0)
    console.warn(
      `cloudhal: filter "${filter}" names unknown terms: ${resolved.unknown.join(", ")}`,
    );
  return resolved;
}

function visible<T extends { status: Page["status"] }>(nodes: T[], includeDrafts: boolean): T[] {
  return includeDrafts
    ? nodes.filter((n) => n.status !== "archived")
    : nodes.filter((n) => n.status === "published");
}

/** Reads the current nodes on every call. Drafts are included so authors can preview them in dev. */
export class LiveSource implements GraphSource {
  readonly mode = "live";
  readonly #store: SiteGraphStore;
  readonly #siteId: string;
  readonly #includeDrafts: boolean;

  constructor(store: SiteGraphStore, siteId: string, options: { includeDrafts?: boolean } = {}) {
    this.#store = store;
    this.#siteId = siteId;
    this.#includeDrafts = options.includeDrafts ?? true;
  }

  async site(): Promise<Site> {
    const site = await this.#store.getSite(this.#siteId);
    if (!site) throw new Error(`site ${this.#siteId} not found`);
    return site;
  }

  async pages(): Promise<Page[]> {
    const site = await this.site();
    const pages = visible(await this.#store.listPages(this.#siteId), this.#includeDrafts);
    const order = new Map(site.pageIds.map((id, i) => [id, i]));
    return pages.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
  }

  async pageByPath(path: string, locale?: string): Promise<Page | undefined> {
    const loc = locale ?? (await this.site()).defaultLocale;
    return (await this.pages()).find((p) => p.path === path && p.locale === loc);
  }

  async entries(collection: string, locale?: string): Promise<ContentEntry[]> {
    const loc = locale ?? (await this.site()).defaultLocale;
    const all = visible(
      await this.#store.listContentEntries(this.#siteId, collection),
      this.#includeDrafts,
    );
    return all.filter((e) => e.locale === loc).sort(byNewest);
  }

  async entryBySlug(
    collection: string,
    slug: string,
    locale?: string,
  ): Promise<ContentEntry | undefined> {
    return (await this.entries(collection, locale)).find((e) => e.slug === slug);
  }
  async allEntries(locale?: string): Promise<ContentEntry[]> {
    const loc = locale ?? (await this.site()).defaultLocale;
    return visible(await this.#store.listContentEntries(this.#siteId), this.#includeDrafts)
      .filter((e) => e.locale === loc)
      .sort(byNewest);
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
    const out = visible(entries, this.#includeDrafts)
      .filter((e) => matches(f, e))
      .sort(byNewest);
    return options.limit === undefined ? out : out.slice(0, options.limit);
  }

  entriesByTerm(
    key: string,
    slug: string,
    options: { locale?: string; limit?: number; descendants?: boolean } = {},
  ): Promise<ContentEntry[]> {
    return this.entriesByFilter(termFilter(key, slug, options.descendants === true), options);
  }

  redirectFor(path: string): Promise<RedirectMatch | undefined> {
    return this.#store.redirectFor(this.#siteId, path);
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
        pages,
        entries,
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

interface Loaded {
  site: Site;
  pages: Page[];
  entries: ContentEntry[];
  taxonomies: Taxonomy[];
  terms: Term[];
  redirects: Redirect[];
  menus: Menu[];
  assets: Asset[];
  /** Assets by id and by 16-hex URL prefix, built once per snapshot (RFC-0004 §7.1). */
  assetIndex: Map<string, Asset>;
}

/** Reads exactly the node bodies captured in a snapshot (immutable; only published nodes are rendered). */
export class SnapshotSource implements GraphSource {
  readonly mode = "snapshot";
  readonly #store: SiteGraphStore;
  readonly #snapshot: Snapshot;
  #cache: Promise<Loaded> | undefined;

  constructor(store: SiteGraphStore, snapshot: Snapshot) {
    this.#store = store;
    this.#snapshot = snapshot;
  }

  static async open(store: SiteGraphStore, snapshotId: string): Promise<SnapshotSource> {
    const snapshot = await store.getSnapshot(snapshotId);
    if (!snapshot) throw new Error(`snapshot ${snapshotId} not found`);
    return new SnapshotSource(store, snapshot);
  }

  get snapshot(): Snapshot {
    return this.#snapshot;
  }

  /** Reads the snapshot's nodes once; kinds this renderer does not know are ignored. */
  #load(): Promise<Loaded> {
    this.#cache ??= (async () => {
      const read = <T>(refs: NodeRef[]) =>
        Promise.all(refs.map((r) => this.#store.readSnapshotNode<T & Site>(r)));
      const siteRef = this.#snapshot.nodes.find((n) => n.kind === "site");
      if (!siteRef) throw new Error(`snapshot ${this.#snapshot.id} has no site node`);
      const [site] = await read<Site>([siteRef]);
      const pages = (await read<Page>(
        this.#snapshot.nodes.filter((n) => n.kind === "page"),
      )) as unknown as Page[];
      const entries = (await read<ContentEntry>(
        this.#snapshot.nodes.filter((n) => n.kind === "contentEntry"),
      )) as unknown as ContentEntry[];
      const byKind = async <T>(kind: string) =>
        (await read<T>(
          this.#snapshot.nodes.filter((n) => (n.kind as string) === kind),
        )) as unknown as T[];
      const [taxonomies, terms, redirects, menus, assets] = await Promise.all([
        byKind<Taxonomy>("taxonomy"),
        byKind<Term>("term"),
        byKind<Redirect>("redirect"),
        byKind<Menu>("menu"),
        byKind<Asset>("asset"),
      ]);
      const assetIndex = new Map<string, Asset>();
      for (const a of assets) {
        assetIndex.set(a.id, a);
        assetIndex.set(a.sha256.slice(0, 16), a);
      }
      const order = new Map((site as Site).pageIds.map((id, i) => [id, i]));
      return {
        site: site as Site,
        pages: visible(pages, false).sort(
          (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
        ),
        entries: visible(entries, false),
        taxonomies,
        terms,
        redirects,
        menus,
        assets,
        assetIndex,
      };
    })();
    return this.#cache;
  }

  async site(): Promise<Site> {
    return (await this.#load()).site;
  }

  async pages(): Promise<Page[]> {
    return (await this.#load()).pages;
  }

  async pageByPath(path: string, locale?: string): Promise<Page | undefined> {
    const { site, pages } = await this.#load();
    const loc = locale ?? site.defaultLocale;
    return pages.find((p) => p.path === path && p.locale === loc);
  }

  async entries(collection: string, locale?: string): Promise<ContentEntry[]> {
    const { site, entries } = await this.#load();
    const loc = locale ?? site.defaultLocale;
    return entries.filter((e) => e.collection === collection && e.locale === loc).sort(byNewest);
  }

  async entryBySlug(
    collection: string,
    slug: string,
    locale?: string,
  ): Promise<ContentEntry | undefined> {
    return (await this.entries(collection, locale)).find((e) => e.slug === slug);
  }
  async allEntries(locale?: string): Promise<ContentEntry[]> {
    const { site, entries } = await this.#load();
    const loc = locale ?? site.defaultLocale;
    return entries.filter((e) => e.locale === loc).sort(byNewest);
  }

  async taxonomies(): Promise<Taxonomy[]> {
    return (await this.#load()).taxonomies;
  }

  async terms(key: string): Promise<Term[]> {
    const { site, taxonomies, terms } = await this.#load();
    const tax = taxonomies.find((t) => t.key === key);
    if (!tax) return [];
    return terms
      .filter((t) => t.taxonomyId === tax.id && shown(t, false))
      .sort(byPosition(site.defaultLocale));
  }

  async termBySlug(key: string, slug: string): Promise<Term | undefined> {
    return (await this.terms(key)).find((t) => t.slug === slug);
  }

  async vocabulary(key?: string): Promise<Term[]> {
    const { site, taxonomies, terms } = await this.#load();
    if (key === undefined) return [...terms].sort(byPosition(site.defaultLocale));
    const tax = taxonomies.find((t) => t.key === key);
    if (!tax) return [];
    return terms.filter((t) => t.taxonomyId === tax.id).sort(byPosition(site.defaultLocale));
  }

  async entriesByFilter(
    filter: string,
    options: { locale?: string; limit?: number } = {},
  ): Promise<ContentEntry[]> {
    const { site, entries, taxonomies, terms } = await this.#load();
    const loc = options.locale ?? site.defaultLocale;
    const f = compile(filter, taxonomies, terms);
    const out = entries.filter((e) => e.locale === loc && matches(f, e)).sort(byNewest);
    return options.limit === undefined ? out : out.slice(0, options.limit);
  }

  entriesByTerm(
    key: string,
    slug: string,
    options: { locale?: string; limit?: number; descendants?: boolean } = {},
  ): Promise<ContentEntry[]> {
    return this.entriesByFilter(termFilter(key, slug, options.descendants === true), options);
  }

  async redirectFor(path: string): Promise<RedirectMatch | undefined> {
    return matchRedirect((await this.#load()).redirects, path);
  }

  async redirects(): Promise<Redirect[]> {
    return (await this.#load()).redirects;
  }

  async menu(key: string): Promise<Menu | undefined> {
    return (await this.#load()).menus.find((m) => m.key === key);
  }

  async navigation(
    key: string,
    locale?: string,
    options: NavigationOptions = {},
  ): Promise<Navigation | undefined> {
    const loaded = await this.#load();
    const menu = loaded.menus.find((m) => m.key === key);
    if (!menu) return undefined;
    // Only published pages and entries are loaded: anything else resolves as missing (hidden).
    return navigationFor(
      menu,
      {
        site: loaded.site,
        pages: loaded.pages,
        entries: loaded.entries,
        taxonomies: loaded.taxonomies,
        terms: loaded.terms,
        ...(options.collectionIndex ? { collectionIndex: options.collectionIndex } : {}),
      },
      locale ?? loaded.site.defaultLocale,
    );
  }

  async assets(): Promise<Asset[]> {
    return (await this.#load()).assets;
  }

  async asset(id: string): Promise<Asset | undefined> {
    return id.startsWith("asset_") ? (await this.#load()).assetIndex.get(id) : undefined;
  }

  async assetByPrefix(prefix16: string): Promise<Asset | undefined> {
    return /^[0-9a-f]{16}$/.test(prefix16)
      ? (await this.#load()).assetIndex.get(prefix16)
      : undefined;
  }
}
