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
import type { RedirectMatch, SearchKind, SearchResults, SiteGraphStore } from "@cloudhal/core-ts";
import { matchRedirect, redirectLocale, searchDocuments, searchRows } from "@cloudhal/core-ts";
import {
  gateInstants,
  hasGates,
  inheritedGate,
  isAvailable,
  nextInstant,
} from "@cloudhal/core-ts/availability";
import { matches } from "@cloudhal/core-ts/filter";
import { assetRefsOf } from "@cloudhal/core-ts/media";
import { type EntryFieldsOptions, entryFields, type RenderedFields } from "./fields.ts";
import { type Navigation, type NavigationOptions, navigationFor } from "./navigation.ts";
import { byNewest, byPosition, compile, shown, termFilter, visible } from "./source-helpers.ts";

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
  /**
   * A visible entry by id, any locale (reader comments name the entry by id, RFC-0007 §6.2).
   * Optional for sources that predate comments.
   */
  entryById?(id: string): Promise<ContentEntry | undefined>;
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
  /** The redirect for a request path in a locale (default: the site's): exact, then longest prefix. */
  redirectFor(path: string, locale?: string): Promise<RedirectMatch | undefined>;
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
  /**
   * RFC-0008 §7.4: the next instant (ms since the epoch) at which a time gate changes what this
   * source shows; undefined when none lies ahead or the source ignores gates (previews, drafts).
   * Optional for sources that predate gates.
   */
  nextGate?(): Promise<number | undefined>;
  /**
   * RFC-0019 §3: articles matching a reader's query, best first. Snapshot mode reads the search
   * index (it matches the live snapshot; `stale` says when it is behind); live mode searches the
   * entries it shows, drafts included. Optional for sources that predate search.
   */
  search?(query: string, options?: SourceSearchOptions): Promise<SearchResults>;
  /**
   * RFC-0041 §9: an entry's typed fields as a theme draws them: resolved (a translation reads the
   * original's values where §5 says so), labelled in `options.locale` (default: the entry's), rich
   * text as sanitized HTML, URLs through `safeHref`, images as `<img>` attributes. `{}` when the
   * collection has no definitions. Optional for sources that predate fields; any source works
   * with the standalone `entryFields(source, entry)`.
   */
  entryFields?(entry: ContentEntry, options?: EntryFieldsOptions): Promise<RenderedFields>;
}

export interface SourceSearchOptions {
  page?: number;
  perPage?: number;
  /** Default: the site's default locale. */
  locale?: string;
  /** RFC-0029: only these kinds (default: all). */
  kinds?: readonly SearchKind[];
}

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

  async nextGate(): Promise<number | undefined> {
    if (this.#includeDrafts) return undefined;
    const [pages, entries] = await Promise.all([
      this.#store.listPages(this.#siteId),
      this.#store.listContentEntries(this.#siteId),
    ]);
    const published = [...pages, ...entries].filter((n) => n.status === "published");
    return nextInstant(gateInstants(published), this.#now());
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
    const all = this.#visible(await this.#store.listContentEntries(this.#siteId, collection));
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
    return this.#visible(await this.#store.listContentEntries(this.#siteId))
      .filter((e) => e.locale === loc)
      .sort(byNewest);
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
    return entry && entry.siteId === this.#siteId && this.#visible([entry]).length
      ? entry
      : undefined;
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
    const out = this.#visible(entries)
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
        entries: this.#includeDrafts ? entries : this.#visible(entries),
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

/** Everything a snapshot shows before gates are applied; built once per snapshot and isolate. */
interface Loaded {
  site: Site;
  /** Published pages in `Site.pageIds` order and published entries, gates not yet applied. */
  pages: Page[];
  entries: ContentEntry[];
  taxonomies: Taxonomy[];
  terms: Term[];
  redirects: Redirect[];
  menus: Menu[];
  assets: Asset[];
  /** Assets by id and by 16-hex URL prefix, built once per snapshot (RFC-0004 §7.1). */
  assetIndex: Map<string, Asset>;
  /**
   * The gate index (RFC-0008 §7.4): every instant at which a published page's or entry's gate
   * changes, sorted. Empty for a site that schedules nothing — then nothing is filtered at all.
   */
  gates: number[];
}

/** What a snapshot shows at one instant (or, for previews, regardless of gates). */
interface View {
  site: Site;
  pages: Page[];
  entries: ContentEntry[];
  taxonomies: Taxonomy[];
  terms: Term[];
  redirects: Redirect[];
  menus: Menu[];
  assets: Asset[];
  assetIndex: ReadonlyMap<string, Asset>;
}

/** State shared by every view of one snapshot: the loaded nodes and the asset gates. */
interface Shared {
  loaded?: Promise<Loaded> | undefined;
  assetGates?: Promise<ReadonlyMap<string, number>>;
  /** RFC-0010: whether the snapshot's bundle was there when it loaded, or is being written. */
  bundle?: "present" | "missing" | "persisting";
  /** Bodies read node by node (no bundle), as stored JSON text, kept to write the bundle. */
  fetched?: Map<string, string> | undefined;
}

/** Who may see the nodes of a snapshot: the clock gates are checked against, or nobody (previews). */
type Clock = (() => number) | null;

/**
 * The embargo instant each asset inherits (RFC-0008 §7.2): an asset whose every live referrer —
 * published pages and entries, shown terms — has an embargo is hidden until the earliest one
 * opens. Only assets used by a gated node can inherit anything, so only their referrers are read.
 */
function assetGates(loaded: Loaded): Map<string, number> {
  const out = new Map<string, number>();
  const gated = [...loaded.pages, ...loaded.entries].filter(hasGates);
  const kindOf = (n: Page | ContentEntry) => ("collection" in n ? "contentEntry" : "page");
  const candidates = new Set(gated.flatMap((n) => assetRefsOf(kindOf(n), n).map((r) => r.assetId)));
  if (candidates.size === 0) return out;
  const referrers = new Map<string, Array<{ availability?: Page["availability"] }>>();
  const add = (kind: string, node: Page | ContentEntry | Term, gate: Page["availability"]) => {
    for (const ref of assetRefsOf(kind, node)) {
      if (!candidates.has(ref.assetId)) continue;
      const list = referrers.get(ref.assetId) ?? [];
      list.push(gate === undefined ? {} : { availability: gate });
      referrers.set(ref.assetId, list);
    }
  };
  for (const p of loaded.pages) add("page", p, p.availability);
  for (const e of loaded.entries) add("contentEntry", e, e.availability);
  for (const t of loaded.terms) if (shown(t, false)) add("term", t, undefined);
  for (const [id, list] of referrers) {
    const from = inheritedGate(list)?.from;
    if (from !== undefined) out.set(id, Date.parse(from));
  }
  return out;
}

/**
 * Reads exactly the node bodies captured in a snapshot (immutable; only published nodes are
 * rendered). Time gates (RFC-0008 §7) apply on top: by default against the wall clock at each
 * call; `at(now)` fixes the instant for one request (the Site Worker does, so a page and the
 * lists on it agree); `ungated()` is the preview view, which shows gated nodes.
 */
export class SnapshotSource implements GraphSource {
  readonly mode = "snapshot";
  readonly #store: SiteGraphStore;
  readonly #snapshot: Snapshot;
  readonly #shared: Shared;
  readonly #clock: Clock;
  #view: { now: number | null; view: Promise<View> } | undefined;

  constructor(
    store: SiteGraphStore,
    snapshot: Snapshot,
    options: { now?: () => number; shared?: Shared; ungated?: boolean } = {},
  ) {
    this.#store = store;
    this.#snapshot = snapshot;
    this.#shared = options.shared ?? {};
    this.#clock = options.ungated ? null : (options.now ?? Date.now);
  }

  static async open(store: SiteGraphStore, snapshotId: string): Promise<SnapshotSource> {
    const snapshot = await store.getSnapshot(snapshotId);
    if (!snapshot) throw new Error(`snapshot ${snapshotId} not found`);
    return new SnapshotSource(store, snapshot);
  }

  get snapshot(): Snapshot {
    return this.#snapshot;
  }

  /** This snapshot as the public sees it at `now` (one instant for a whole request). */
  at(now: number): SnapshotSource {
    return new SnapshotSource(this.#store, this.#snapshot, {
      now: () => now,
      shared: this.#shared,
    });
  }

  /** This snapshot with gates ignored: previews show embargoed and expired nodes (§7.3). */
  ungated(): SnapshotSource {
    return new SnapshotSource(this.#store, this.#snapshot, {
      shared: this.#shared,
      ungated: true,
    });
  }

  /** True when this view ignores gates (a preview). */
  get gatesIgnored(): boolean {
    return this.#clock === null;
  }

  /**
   * The next instant (ms) at which anything this snapshot shows changes because of a gate, after
   * this view's `now`; undefined when no gate lies ahead (or gates are ignored). The Site Worker
   * caps the edge cache with it (§7.4).
   */
  async nextGate(): Promise<number | undefined> {
    if (this.#clock === null) return undefined;
    const { gates } = await this.#load();
    return gates.length === 0 ? undefined : nextInstant(gates, this.#clock());
  }

  /** Reads the snapshot's nodes once; kinds this renderer does not know are ignored. */
  #load(): Promise<Loaded> {
    this.#shared.loaded ??= (async () => {
      // RFC-0010: one round of shard reads when the snapshot has a bundle; node by node otherwise.
      const bundle = await this.#store.readSnapshotBundle(this.#snapshot).catch(() => undefined);
      this.#shared.bundle = bundle ? "present" : "missing";
      const fetched = bundle ? undefined : new Map<string, string>();
      const read = <T>(refs: NodeRef[]) =>
        Promise.all(
          refs.map(async (r) => {
            const hit = bundle?.get(r.hash);
            if (hit !== undefined) return hit as T & Site;
            const body = await this.#store.readSnapshotNode<T & Site>(r);
            // as stored, before anything downstream could touch the object
            fetched?.set(r.hash, JSON.stringify(body));
            return body;
          }),
        );
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
      const shownPages = visible(pages, false).sort(
        (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
      );
      const shownEntries = visible(entries, false);
      if (fetched) this.#shared.fetched = fetched;
      return {
        site: site as Site,
        pages: shownPages,
        entries: shownEntries,
        taxonomies,
        terms,
        redirects,
        menus,
        assets,
        assetIndex,
        gates: gateInstants([...shownPages, ...shownEntries]),
      };
    })();
    this.#shared.loaded.catch(() => {
      this.#shared.loaded = undefined;
    });
    return this.#shared.loaded;
  }

  /**
   * RFC-0010 read-through: when this snapshot loaded without a bundle, write one in the background
   * (`defer` keeps the task alive, e.g. the Worker's `waitUntil`). The resolver calls it for the
   * published snapshot only: previews and history never get a bundle. Never throws; a failed write
   * leaves the snapshot loading node by node, and the next request tries again.
   */
  persistBundle(defer: (task: Promise<unknown>) => void): void {
    if (this.#shared.bundle === "present" || this.#shared.bundle === "persisting") return;
    const task = this.#load()
      .then(async () => {
        if (this.#shared.bundle !== "missing") return;
        this.#shared.bundle = "persisting";
        await this.#store.writeSnapshotBundle(this.#snapshot, this.#shared.fetched ?? new Map());
        this.#shared.bundle = "present";
        this.#shared.fetched = undefined;
      })
      .catch(() => {
        if (this.#shared.bundle === "persisting") this.#shared.bundle = "missing";
      });
    defer(task);
  }

  #assetGates(loaded: Loaded): Promise<ReadonlyMap<string, number>> {
    this.#shared.assetGates ??= Promise.resolve().then(() => assetGates(loaded));
    return this.#shared.assetGates;
  }

  /**
   * What this view shows: every published node when gates are ignored or the snapshot has none;
   * otherwise the nodes (and inherited assets) whose gates are open at this view's instant.
   */
  #current(): Promise<View> {
    const now = this.#clock === null ? null : this.#clock();
    if (this.#view?.now === now) return this.#view.view;
    const view = (async (): Promise<View> => {
      const loaded = await this.#load();
      if (now === null || loaded.gates.length === 0) return loaded;
      const gates = await this.#assetGates(loaded);
      const hidden = new Set([...gates].filter(([, from]) => !(from <= now)).map(([id]) => id));
      const assets =
        hidden.size === 0 ? loaded.assets : loaded.assets.filter((a) => !hidden.has(a.id));
      const assetIndex =
        hidden.size === 0
          ? loaded.assetIndex
          : new Map([...loaded.assetIndex].filter(([, a]) => !hidden.has(a.id)));
      return {
        ...loaded,
        pages: loaded.pages.filter((p) => isAvailable(p, now)),
        entries: loaded.entries.filter((e) => isAvailable(e, now)),
        assets,
        assetIndex,
      };
    })();
    this.#view = { now, view };
    return view;
  }

  async site(): Promise<Site> {
    return (await this.#current()).site;
  }

  async pages(): Promise<Page[]> {
    return (await this.#current()).pages;
  }

  async pageByPath(path: string, locale?: string): Promise<Page | undefined> {
    const { site, pages } = await this.#current();
    const loc = locale ?? site.defaultLocale;
    return pages.find((p) => p.path === path && p.locale === loc);
  }

  async entries(collection: string, locale?: string): Promise<ContentEntry[]> {
    const { site, entries } = await this.#current();
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
    const { site, entries } = await this.#current();
    const loc = locale ?? site.defaultLocale;
    return entries.filter((e) => e.locale === loc).sort(byNewest);
  }

  async search(query: string, options: SourceSearchOptions = {}): Promise<SearchResults> {
    const locale = options.locale ?? (await this.site()).defaultLocale;
    return this.#store.search(this.#snapshot.siteId, query, {
      ...options,
      locale,
      now: this.#clock?.() ?? Date.now(),
      snapshotId: this.#snapshot.id,
    });
  }

  /** A published entry of this snapshot by id (any locale), if its gates are open. */
  async entryById(id: string): Promise<ContentEntry | undefined> {
    return (await this.#current()).entries.find((e) => e.id === id);
  }

  entryFields(entry: ContentEntry, options?: EntryFieldsOptions): Promise<RenderedFields> {
    return entryFields(this, entry, options);
  }

  async taxonomies(): Promise<Taxonomy[]> {
    return (await this.#current()).taxonomies;
  }

  async terms(key: string): Promise<Term[]> {
    const { site, taxonomies, terms } = await this.#current();
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
    const { site, taxonomies, terms } = await this.#current();
    if (key === undefined) return [...terms].sort(byPosition(site.defaultLocale));
    const tax = taxonomies.find((t) => t.key === key);
    if (!tax) return [];
    return terms.filter((t) => t.taxonomyId === tax.id).sort(byPosition(site.defaultLocale));
  }

  async entriesByFilter(
    filter: string,
    options: { locale?: string; limit?: number } = {},
  ): Promise<ContentEntry[]> {
    const { site, entries, taxonomies, terms } = await this.#current();
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

  async redirectFor(path: string, locale?: string): Promise<RedirectMatch | undefined> {
    const { site, redirects } = await this.#current();
    return matchRedirect(redirects, path, locale && redirectLocale(locale, site.defaultLocale));
  }

  async redirects(): Promise<Redirect[]> {
    return (await this.#current()).redirects;
  }

  async menu(key: string): Promise<Menu | undefined> {
    return (await this.#current()).menus.find((m) => m.key === key);
  }

  async navigation(
    key: string,
    locale?: string,
    options: NavigationOptions = {},
  ): Promise<Navigation | undefined> {
    const view = await this.#current();
    const menu = view.menus.find((m) => m.key === key);
    if (!menu) return undefined;
    // Only published pages and entries whose gates are open are here: anything else resolves as
    // missing, so its menu item is hidden (RFC-0003 §7.1, RFC-0008 §7.2).
    return navigationFor(
      menu,
      {
        site: view.site,
        pages: view.pages,
        entries: view.entries,
        taxonomies: view.taxonomies,
        terms: view.terms,
        ...(options.collectionIndex ? { collectionIndex: options.collectionIndex } : {}),
      },
      locale ?? view.site.defaultLocale,
    );
  }

  async assets(): Promise<Asset[]> {
    return (await this.#current()).assets;
  }

  async asset(id: string): Promise<Asset | undefined> {
    return id.startsWith("asset_") ? (await this.#current()).assetIndex.get(id) : undefined;
  }

  async assetByPrefix(prefix16: string): Promise<Asset | undefined> {
    return /^[0-9a-f]{16}$/.test(prefix16)
      ? (await this.#current()).assetIndex.get(prefix16)
      : undefined;
  }
}
