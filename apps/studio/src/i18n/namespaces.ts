/**
 * Lazy message namespaces (DESIGN.md §1 "Lazy message namespaces"). The core catalogs
 * (`<locale>.ts`) are in every page's first load; a feature whose words only its own screens need keeps
 * them in `lazy/<namespace>.<locale>.ts`, one top-level key per namespace, loaded with the
 * routes that show it (`withMessages` in `router.tsx`) and read through `useT("<namespace>")`,
 * which suspends until the current locale's module is there.
 *
 * Adding one: move the top-level block out of `en.ts`/`tr.ts` into `lazy/<ns>.en.ts`
 * (`export const messages = { <ns>: { … } } as const`) and one `lazy/<ns>.<locale>.ts` per other
 * language (`export const messages: NamespaceMessages<"<ns>"> = { … }`; found by name), add the
 * type to `NamespaceCatalogs`, then add the namespace to every route's `withMessages` that renders
 * it. The type checks (and `test/i18n.test.tsx`) keep every language on English's keys.
 */

import type { messages as aiSettings } from "./lazy/aiSettings.en.ts";
import type { messages as analytics } from "./lazy/analytics.en.ts";
import type { messages as analyticsSettings } from "./lazy/analyticsSettings.en.ts";
import type { messages as appearance } from "./lazy/appearance.en.ts";
import type { messages as bodyEditor } from "./lazy/bodyEditor.en.ts";
import type { messages as build } from "./lazy/build.en.ts";
import type { messages as collections } from "./lazy/collections.en.ts";
import type { messages as comments } from "./lazy/comments.en.ts";
import type { messages as commentsSettings } from "./lazy/commentsSettings.en.ts";
import type { messages as fields } from "./lazy/fields.en.ts";
import type { messages as media } from "./lazy/media.en.ts";
import type { messages as menus } from "./lazy/menus.en.ts";
import type { messages as readers } from "./lazy/readers.en.ts";
import type { messages as scheduleSettings } from "./lazy/scheduleSettings.en.ts";
import type { messages as schedules } from "./lazy/schedules.en.ts";
import type { Locale } from "./locales.ts";

type DeepString<T> = { [K in keyof T]: T[K] extends string ? string : DeepString<T[K]> };

/** Every lazy namespace's shape (from its English module), keyed by namespace. */
export interface NamespaceCatalogs {
  aiSettings: DeepString<(typeof aiSettings)["aiSettings"]>;
  analytics: DeepString<(typeof analytics)["analytics"]>;
  analyticsSettings: DeepString<(typeof analyticsSettings)["analyticsSettings"]>;
  appearance: DeepString<(typeof appearance)["appearance"]>;
  bodyEditor: DeepString<(typeof bodyEditor)["bodyEditor"]>;
  build: DeepString<(typeof build)["build"]>;
  collections: DeepString<(typeof collections)["collections"]>;
  comments: DeepString<(typeof comments)["comments"]>;
  commentsSettings: DeepString<(typeof commentsSettings)["commentsSettings"]>;
  fields: DeepString<(typeof fields)["fields"]>;
  media: DeepString<(typeof media)["media"]>;
  menus: DeepString<(typeof menus)["menus"]>;
  readers: DeepString<(typeof readers)["readers"]>;
  scheduleSettings: DeepString<(typeof scheduleSettings)["scheduleSettings"]>;
  schedules: DeepString<(typeof schedules)["schedules"]>;
}
export type Namespace = keyof NamespaceCatalogs;
/** What a namespace module exports as `messages`: `{ [namespace]: catalog }`. */
export type NamespaceMessages<N extends Namespace> = { [K in N]: NamespaceCatalogs[K] };

/**
 * English's namespace modules, by path (`./lazy/<namespace>.en.ts`): in the first load, since
 * English is every key's fallback. Each other language's loaders are a small generated module of
 * their own (`./loaders/<locale>.ts`, written by `pnpm i18n:import`), fetched only when Studio
 * shows that language (`loadNamespaceIndex`, with its core catalog), so the first load does not
 * grow with every language added; a new language's files are still found by name.
 */
export type Loader = () => Promise<{ messages: Record<string, object> }>;
const ENGLISH_MODULES = import.meta.glob<{ messages: Record<string, object> }>("./lazy/*.en.ts");
const INDEXES = import.meta.glob<{ loaders: Record<string, Loader> }>("./loaders/*.ts");
const PREFIX = "./lazy/";
const ENGLISH = ".en.ts";

/** The namespaces, one per English module. */
export const NAMESPACES = Object.keys(ENGLISH_MODULES)
  .map((path) => path.slice(PREFIX.length, -ENGLISH.length))
  .sort() as Namespace[];

export function isNamespace(name: string): name is Namespace {
  return Object.hasOwn(ENGLISH_MODULES, `${PREFIX}${name}${ENGLISH}`);
}

const indexes = new Map<Locale, Promise<Record<string, Loader>>>();

/** `locale`'s namespace loaders (its `./loaders/<locale>.ts`), fetched once. */
export function loadNamespaceIndex(locale: Locale): Promise<Record<string, Loader>> {
  let index = indexes.get(locale);
  if (!index) {
    const load = INDEXES[`./loaders/${locale}.ts`];
    if (!load) return Promise.resolve({});
    index = load().then(
      (module) => module.loaders,
      (error: unknown) => {
        indexes.delete(locale);
        throw error;
      },
    );
    indexes.set(locale, index);
  }
  return index;
}

async function loaderFor(ns: Namespace, locale: Locale): Promise<Loader | undefined> {
  if (locale === "en") return ENGLISH_MODULES[`${PREFIX}${ns}${ENGLISH}`];
  return (await loadNamespaceIndex(locale))[`../lazy/${ns}.${locale}.ts`];
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
    promise = loaderFor(ns, locale)
      .then((load) => {
        if (!load) throw new Error(`no "${ns}" messages for locale "${locale}"`);
        return load();
      })
      .then(
        (module) => {
          loaded.set(key, module.messages[ns] as object);
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
  indexes.clear();
}
