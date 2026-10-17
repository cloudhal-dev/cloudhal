import { cloudhalMessages } from "@cloudhal/messages/vite";

/**
 * The message catalogs (`src/i18n/<locale>.ts`, `src/i18n/lazy/<ns>.<locale>.ts`) compiled at
 * build time (RFC-0032, ADR-0032): plurals and selects become data, so no message parser ships.
 * Used by `vite.config.ts` and `vitest.config.ts`, so tests see what the app sees.
 */
export const CATALOG_MODULE =
  /[\\/]apps[\\/]studio[\\/]src[\\/]i18n[\\/](?:lazy[\\/][\w-]+\.[\w-]+|(?!locales\.ts$|namespaces\.ts$)[\w-]+)\.ts$/;

export const catalogs = () => cloudhalMessages({ include: CATALOG_MODULE });
