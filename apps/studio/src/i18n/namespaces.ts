/**
 * Lazy message namespaces (DESIGN.md §1 "Lazy message namespaces"). The core catalogs (`en.ts`,
 * `tr.ts`) are in every page's first load; a feature whose words only its own screens need keeps
 * them in `lazy/<namespace>.<locale>.ts`, one top-level key per namespace, loaded with the
 * routes that show it (`withMessages` in `router.tsx`) and read through `useT("<namespace>")`,
 * which suspends until the current locale's module is there.
 *
 * Adding one: move the top-level block out of `en.ts`/`tr.ts` into `lazy/<ns>.en.ts`
 * (`export const messages = { <ns>: { … } } as const`) and `lazy/<ns>.tr.ts`
 * (`export const messages: NamespaceMessages<"<ns>"> = { … }`), register both loaders below and
 * add the type to `NamespaceCatalogs`, then add the namespace to every route's `withMessages` that
 * renders it. The type checks (and `test/i18n.test.tsx`) keep `en` and `tr` on the same keys.
 */
import type { Locale } from "./index.tsx";
import type { messages as analytics } from "./lazy/analytics.en.ts";
import type { messages as analyticsSettings } from "./lazy/analyticsSettings.en.ts";
import type { messages as comments } from "./lazy/comments.en.ts";
import type { messages as commentsSettings } from "./lazy/commentsSettings.en.ts";
import type { messages as readers } from "./lazy/readers.en.ts";

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** Every lazy namespace's shape (from its English module), keyed by namespace. */
export interface NamespaceCatalogs {
  analytics: DeepString<(typeof analytics)["analytics"]>;
  analyticsSettings: DeepString<(typeof analyticsSettings)["analyticsSettings"]>;
  comments: DeepString<(typeof comments)["comments"]>;
  commentsSettings: DeepString<(typeof commentsSettings)["commentsSettings"]>;
  readers: DeepString<(typeof readers)["readers"]>;
}
export type Namespace = keyof NamespaceCatalogs;
/** What a namespace module exports as `messages`: `{ [namespace]: catalog }`. */
export type NamespaceMessages<N extends Namespace> = { [K in N]: NamespaceCatalogs[K] };

type Loader<N extends Namespace> = () => Promise<{ messages: NamespaceMessages<N> }>;

/** One dynamic import per namespace and locale, so a page loads only the language it shows. */
const LOADERS: { [N in Namespace]: Record<Locale, Loader<N>> } = {
  analytics: {
    en: () => import("./lazy/analytics.en.ts"),
    tr: () => import("./lazy/analytics.tr.ts"),
  },
  analyticsSettings: {
    en: () => import("./lazy/analyticsSettings.en.ts"),
    tr: () => import("./lazy/analyticsSettings.tr.ts"),
  },
  comments: {
    en: () => import("./lazy/comments.en.ts"),
    tr: () => import("./lazy/comments.tr.ts"),
  },
  commentsSettings: {
    en: () => import("./lazy/commentsSettings.en.ts"),
    tr: () => import("./lazy/commentsSettings.tr.ts"),
  },
  readers: {
    en: () => import("./lazy/readers.en.ts"),
    tr: () => import("./lazy/readers.tr.ts"),
  },
};

export const NAMESPACES = Object.keys(LOADERS) as Namespace[];

export function isNamespace(name: string): name is Namespace {
  return Object.hasOwn(LOADERS, name);
}

const loaded = new Map<string, object>();
const pending = new Map<string, Promise<void>>();
const id = (ns: Namespace, locale: Locale) => `${ns}:${locale}`;

/** The namespace's catalog in `locale`, if its module has arrived. */
export function loadedCatalog(ns: Namespace, locale: Locale): object | undefined {
  return loaded.get(id(ns, locale));
}

/** Namespaces already loaded in `locale` (a locale switch loads the same ones first). */
export function loadedNamespaces(locale: Locale): Namespace[] {
  return NAMESPACES.filter((ns) => loaded.has(id(ns, locale)));
}

/**
 * Loads a namespace in `locale`, once: the same promise until it settles (React's `use` needs a
 * stable one), and a failed load can be retried.
 */
export function loadNamespace(ns: Namespace, locale: Locale): Promise<void> {
  const key = id(ns, locale);
  if (loaded.has(key)) return Promise.resolve();
  let promise = pending.get(key);
  if (!promise) {
    promise = LOADERS[ns][locale]().then(
      (module) => {
        loaded.set(key, (module.messages as Record<string, object>)[ns] as object);
        pending.delete(key);
      },
      (error: unknown) => {
        pending.delete(key);
        throw error;
      },
    );
    pending.set(key, promise);
  }
  return promise;
}

/** For tests: forget every loaded namespace. */
export function resetNamespaces(): void {
  loaded.clear();
  pending.clear();
}
