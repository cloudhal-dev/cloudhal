import type { CollectionSettings, Site } from "@cloudhal/core-contracts";

export { CreateListingPage } from "./CreateListingPage.tsx";

import { ExpirySection } from "./ExpirySection.tsx";
import { ListFieldsSection } from "./ListFieldsSection.tsx";
import { StructuredDataSection } from "./StructuredDataSection.tsx";

/**
 * RFC-0042 §7: collection settings' stage 3 cards, one lazy chunk with the settings route —
 * Listing fields, Expiry and Structured data, each saved on its own.
 */
export function ListingSections(props: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
  readOnlyReason: string | undefined;
}) {
  return (
    <>
      <ListFieldsSection {...props} />
      <ExpirySection {...props} />
      <StructuredDataSection {...props} />
    </>
  );
}
