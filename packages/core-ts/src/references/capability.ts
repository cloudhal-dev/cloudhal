/**
 * RFC-0045 §1: the definition options of a site write from the store's capability
 * (`SiteGraphStoreOptions.fieldTypes`): whether the types are accepted, and the inferred
 * collections a reference may target. Absent capability: both types refused.
 */
import type { Site } from "@cloudhal/core-contracts";
import type { CollectionInfo } from "../collections.ts";
import {
  type FieldTypeSupport,
  type ReferenceDefinitionOptions,
  referenceTypesSupported,
} from "./definitions.ts";
import { hasReferenceFields } from "./issues.ts";

export interface CapableStore {
  readonly fieldTypes: FieldTypeSupport | undefined;
  listCollections(siteId: string): Promise<CollectionInfo[]>;
}

/** The options `checkFieldDefinitions` takes for a write of `site` (one read only when needed). */
export async function referenceDefinitionOptions(
  store: CapableStore,
  site: Pick<Site, "id" | "collections">,
  exists: boolean,
): Promise<ReferenceDefinitionOptions> {
  const referenceTypes = await referenceTypesSupported(site.id, store.fieldTypes);
  if (!referenceTypes || !exists || !hasReferenceFields(site)) return { referenceTypes };
  const inUse = (await store.listCollections(site.id)).map((c) => c.key);
  return { referenceTypes, inUse };
}
