/** Site writes: create, and the CAS update with the footer region, theme config, brand assets and collection permalinks. */
import { assertValid, type Site } from "@cloudhal/core-contracts";
import type { SqlStatement } from "@cloudhal/storage";
import { checkTimeZone, isTimeZone } from "../availability.ts";
import { ConflictError, InvariantError, isOpGuardViolation } from "../errors.ts";
import { nodeHash } from "../hash.ts";
import { checkHosts, hostStatements, hostsOf } from "../hosts.ts";
import { ID_PREFIX } from "../ids.ts";
import { fillMissingSrc } from "../media/refs.ts";
import { and, casUpdateStatement, insertNodeStatement } from "../node-sql.ts";
import { type Creatable, uniquenessKey } from "../nodes.ts";
import { changedPermalinks } from "../permalinks.ts";
import type { SiteGuard } from "../search.ts";
import { checkPageSurfaces, createCatalog } from "../surfaces.ts";
import type { StoreContext } from "./context.ts";
import { planPermalinks } from "./site-permalinks.ts";
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
    // RFC-0034 §4: a hostname belongs to one site of the installation.
    const hosts = hostsOf(site);
    await checkHosts(this.#ctx.sql, hosts);
    await this.#ctx.runUnique(
      await insertNodeStatement("site", site, ts),
      "site",
      uniquenessKey("site", site),
      hostStatements(hosts, { siteId: site.id, hash: await nodeHash(site) }),
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
    // RFC-0034 §4: rewritten only when the hostnames change.
    const hosts = hostsOf(next);
    const hostsChanged = !stored || JSON.stringify(hostsOf(stored)) !== JSON.stringify(hosts);
    if (hostsChanged) await checkHosts(this.#ctx.sql, hosts);
    // RFC-0038 §3: a moved collection template leaves a prefix redirect, in this batch.
    if (stored && stored.rev !== site.rev && changedPermalinks(stored, next).length > 0)
      throw new ConflictError("site", site.id, site.rev, stored.rev);
    const permalinks = await planPermalinks(this.#ctx, stored, next);
    const refs = await this.#ctx.assets.planRefs("site", site.id, next, stored);
    const written = refs.node;
    const s = await casUpdateStatement(
      "site",
      written,
      site.rev,
      and(refs.guard, permalinks?.guard),
    );
    const hash = await nodeHash(written);
    const more = [
      ...(hostsChanged ? hostStatements(hosts, { siteId: site.id, hash }) : []),
      ...(extra?.({ siteId: site.id, hash }, written.updatedAt) ?? []),
      ...refs.statements(hash),
      ...((await permalinks?.statements(hash)) ?? []),
    ];
    const r = await this.#run(s, more);
    if (r.changes !== 1) {
      const rev = await this.#ctx.revOf(site.id);
      if (rev === site.rev) {
        await permalinks?.diagnose();
        await refs.diagnose();
      }
      throw new ConflictError("site", site.id, site.rev, rev);
    }
    return written;
  }

  /** The CAS alone, or with its anchored statements; a failed `op_guards` assertion is a miss. */
  async #run(s: SqlStatement, more: SqlStatement[]): Promise<{ changes: number }> {
    if (more.length === 0) return this.#ctx.sql.run(s.sql, s.params ?? []);
    try {
      return (await this.#ctx.sql.batch([s, ...more]))[0] ?? { changes: 0 };
    } catch (e) {
      if (isOpGuardViolation(e)) return { changes: 0 };
      throw e;
    }
  }
}
