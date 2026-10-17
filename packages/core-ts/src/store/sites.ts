/** Site writes: create, and the CAS update with the footer region, theme config and brand assets. */
import { assertValid, type Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { checkTimeZone, isTimeZone } from "../availability.ts";
import { ConflictError, InvariantError } from "../errors.ts";
import { nodeHash } from "../hash.ts";
import { ID_PREFIX } from "../ids.ts";
import { fillMissingSrc } from "../media/refs.ts";
import { casUpdateStatement, insertNodeStatement } from "../node-sql.ts";
import { type Creatable, uniquenessKey } from "../nodes.ts";
import type { SiteGuard } from "../search.ts";
import { checkPageSurfaces, createCatalog } from "../surfaces.ts";
import type { StoreContext } from "./context.ts";
import { checkThemeConfig } from "./validation.ts";

export class SiteEngine {
  readonly #ctx: StoreContext;

  constructor(ctx: StoreContext) {
    this.#ctx = ctx;
  }

  async create(input: Creatable<Site>): Promise<Site> {
    const ts = this.#ctx.stamp();
    const site: Site = {
      ...input,
      schemaVersion: 1,
      id: input.id ?? this.#ctx.newId(ID_PREFIX.site),
      rev: 0,
      createdAt: ts,
      updatedAt: ts,
    };
    assertValid("site", site);
    checkTimeZone(site.timeZone);
    checkThemeConfig(this.#ctx.graph.themeSettings, site.theme.config, undefined);
    await this.#ctx.runUnique(
      await insertNodeStatement("site", site, ts),
      "site",
      uniquenessKey("site", site),
    );
    return site;
  }

  /** `updateSite` with statements in the same batch, guarded on the site's new hash. */
  async update(
    site: Site,
    extra?: (guard: SiteGuard, at: string) => SqlStatement[],
  ): Promise<Site> {
    const next: Site = structuredClone({
      ...site,
      rev: site.rev + 1,
      updatedAt: this.#ctx.stamp(),
    });
    fillMissingSrc("site", next);
    assertValid("site", next);
    // RFC-0025 §2: the footer's region is a surface, checked like a page's.
    const region = next.chrome?.footer?.region;
    if (region) {
      if (region.kind !== "surface")
        throw new InvariantError("invalid_surface", "chrome.footer.region: a surface section");
      const issues = checkPageSurfaces([region], createCatalog({ blocks: this.#ctx.graph.blocks }));
      if (issues.length)
        throw new InvariantError(
          "invalid_surface",
          `chrome.footer.region: ${issues.map((i) => `${i.path} ${i.message}`).join("; ")}`,
          { issues },
        );
    }
    // Only a config that changes is checked: values a theme change made misfit stay as written.
    if (this.#ctx.graph.themeSettings && next.theme.config !== undefined)
      checkThemeConfig(
        this.#ctx.graph.themeSettings,
        next.theme.config,
        (await this.#ctx.graph.getSite(site.id))?.theme.config,
      );
    // §4.1: a known zone needs no read; an unknown one is refused unless it is the stored one.
    if (next.timeZone !== undefined && !isTimeZone(next.timeZone))
      checkTimeZone(next.timeZone, (await this.#ctx.graph.getSite(site.id))?.timeZone);
    // RFC-0025: the brand's logos are uses of their assets (checked, made canonical, indexed).
    const stored = await this.#ctx.graph.getSite(site.id);
    const refs = await this.#ctx.assets.planRefs("site", site.id, next, stored);
    const written = refs.node;
    const s = await casUpdateStatement("site", written, site.rev, refs.guard);
    const hash = await nodeHash(written);
    const more = [
      ...(extra?.({ siteId: site.id, hash }, written.updatedAt) ?? []),
      ...refs.statements(hash),
    ];
    const r =
      more.length > 0
        ? ((await this.#ctx.sql.batch([s, ...more]))[0] ?? { changes: 0 })
        : await this.#ctx.sql.run(s.sql, s.params ?? []);
    if (r.changes !== 1) {
      const rev = await this.#ctx.revOf(site.id);
      if (rev === site.rev) await refs.diagnose();
      throw new ConflictError("site", site.id, site.rev, rev);
    }
    return written;
  }
}
