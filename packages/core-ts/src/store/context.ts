/**
 * What the store's write engines (`sites`, `pages`, `entries`, `snapshots`) share with
 * `SiteGraphStore`: storage, the clock and ids, the taxonomy and asset engines, and the store's
 * private helpers as closures. Built once in the store's constructor.
 */

import type { ContentEntry, Page, Site } from "@cloudhal/core-contracts";
import type { BlobStore, SqlDriver, SqlStatement } from "@cloudhal/storage";
import type { AssetEngine } from "../assets.ts";
import type { SiteGraphStore } from "../store.ts";
import type { TaxonomyEngine } from "../taxonomy.ts";

export interface StoreContext {
  /** The public store, for reads (`getSite`, `getSnapshot`, …) and `blocks`/`themeSettings`. */
  readonly graph: SiteGraphStore;
  readonly sql: SqlDriver;
  readonly blobs: BlobStore;
  readonly stamp: () => string;
  readonly newId: (prefix: string) => string;
  readonly tax: TaxonomyEngine;
  readonly assets: AssetEngine;
  readonly revOf: (id: string) => Promise<number | undefined>;
  /** One write (plus anchored statements, in one batch); unique violations mapped. */
  readonly runUnique: (
    statement: SqlStatement,
    kind: string,
    key: string,
    extra?: readonly SqlStatement[],
  ) => Promise<{ changes: number }>;
  readonly checkGates: (
    siteId: string,
    before: Page["availability"],
    after: Page["availability"],
  ) => Promise<void>;
  readonly liveEntry: (site: Site, id: string) => Promise<ContentEntry | undefined>;
  readonly shownLive: (site: Site, id: string) => Promise<boolean>;
}
