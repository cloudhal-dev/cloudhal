/**
 * `cloudhalMessages()`: the Vite (and Vitest) plugin that compiles catalog modules at build time
 * (RFC-0032 §2), so no message parser ships. Typed structurally to keep the package free of a
 * Vite dependency.
 */
import { compileCatalogSource } from "./transform.ts";

export interface MessagesPluginOptions {
  /** Which module ids are catalogs. */
  include: RegExp;
}

export function cloudhalMessages(options: MessagesPluginOptions) {
  return {
    name: "cloudhal:messages",
    enforce: "pre" as const,
    transform(code: string, id: string): { code: string; map: null } | null {
      const file = id.split("?")[0] ?? id;
      if (!options.include.test(file)) return null;
      const compiled = compileCatalogSource(code, file);
      return compiled === code ? null : { code: compiled, map: null };
    },
  };
}
