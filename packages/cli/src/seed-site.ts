/** The starter site a new project starts with (`cloudhal init`, and a deploy from Workers Builds). */
import path from "node:path";
import type { Site } from "@cloudhal/core-contracts";
import { type SiteGraphStore, seedStarterSite } from "@cloudhal/core-ts";
import type { PropsSchema } from "@cloudhal/core-ts/blocks";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { loadThemeSettings } from "./blocks.ts";

/**
 * Seeds the starter site into `store`, then applies the theme's motion default. The theme's
 * settings are read after seeding, as `cloudhal init` always has. Also what the starter demo
 * archive is made from (`scripts/demo-archive.ts`), so the demo is what `init` seeds.
 */
export async function seedStarter(
  store: SiteGraphStore,
  input: {
    name: string;
    slug: string;
    siteId?: string | undefined;
    themeSettings: () => Promise<PropsSchema | undefined>;
  },
): Promise<Site> {
  const seeded = await seedStarterSite(store, {
    name: input.name,
    slug: input.slug,
    ...(input.siteId ? { siteId: input.siteId } : {}),
  });
  // RFC-0024 decision 4: new sites start with standard motion when the theme offers it; readers
  // who ask for reduced motion still get less, and existing sites keep theirs.
  const settings = await input.themeSettings();
  return settings && "motion" in settings.properties
    ? await store.updateSite({
        ...seeded,
        theme: {
          ...seeded.theme,
          config: { ...(seeded.theme.config ?? {}), motion: "standard" },
        },
      })
    : seeded;
}

export async function seedProjectSite(
  projectDir: string,
  input: { dataDir: string; name: string; slug: string; siteId?: string },
): Promise<Site> {
  const local = await openLocalStore(path.join(projectDir, input.dataDir));
  try {
    return await seedStarter(local.store, {
      name: input.name,
      slug: input.slug,
      siteId: input.siteId,
      themeSettings: () => loadThemeSettings(projectDir),
    });
  } finally {
    await local.close();
  }
}
