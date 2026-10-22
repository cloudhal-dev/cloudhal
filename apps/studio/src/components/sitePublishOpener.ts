import { createContext, useContext } from "react";

/**
 * Opens the top bar's site Publish confirmation from inside a site screen (the site shell provides
 * it; undefined outside one). The dialog stays where it is, controlled by `open`.
 */
export const SitePublishOpener = createContext<(() => void) | undefined>(undefined);

export function useOpenSitePublish(): (() => void) | undefined {
  return useContext(SitePublishOpener);
}
