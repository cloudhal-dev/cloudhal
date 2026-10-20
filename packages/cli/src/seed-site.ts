/** The starter site a new project starts with (`cloudhal init`, and a deploy from Workers Builds). */
import path from "node:path";
import type { Site } from "@cloudhal/core-contracts";
import { seedStarterSite } from "@cloudhal/core-ts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import { loadThemeSettings } from "./blocks.ts";

export async function seedProjectSite(
  projectDir: string,
  input: { dataDir: string; name: string; slug: string; siteId?: string },
): Promise<Site> {
  const local = await openLocalStore(path.join(projectDir, input.dataDir));
  try {
    const seeded = await seedStarterSite(local.store, {
      name: input.name,
      slug: input.slug,
      ...(input.siteId ? { siteId: input.siteId } : {}),
    });
    // RFC-0024 decision 4: new sites start with standard motion when the theme offers it; readers
    // who ask for reduced motion still get less, and existing sites keep theirs.
    const settings = await loadThemeSettings(projectDir);
    return settings && "motion" in settings.properties
      ? await local.store.updateSite({
          ...seeded,
          theme: {
            ...seeded.theme,
            config: { ...(seeded.theme.config ?? {}), motion: "standard" },
          },
        })
      : seeded;
  } finally {
    await local.close();
  }
}
