import type { ContentEntry, NodeRef, Page, Site, Snapshot } from "@cloudhal/core-contracts";
import type { SiteGraphStore } from "@cloudhal/core-ts";

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
}

function byNewest(a: ContentEntry, b: ContentEntry): number {
  return (b.publishedAt ?? b.createdAt).localeCompare(a.publishedAt ?? a.createdAt);
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
}

/** Reads exactly the node bodies captured in a snapshot (immutable; only published nodes are rendered). */
export class SnapshotSource implements GraphSource {
  readonly mode = "snapshot";
  readonly #store: SiteGraphStore;
  readonly #snapshot: Snapshot;
  #cache: Promise<{ site: Site; pages: Page[]; entries: ContentEntry[] }> | undefined;

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

  #load() {
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
      const order = new Map((site as Site).pageIds.map((id, i) => [id, i]));
      return {
        site: site as Site,
        pages: visible(pages, false).sort(
          (a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9),
        ),
        entries: visible(entries, false),
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
}
