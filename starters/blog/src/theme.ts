/**
 * Theme override point: map a section kind to your own component, e.g.
 *   import MyHero from "./components/MyHero.astro";
 *   export const components = { hero: MyHero };
 */
import type {
  BlockComponents,
  SectionComponents,
} from "@cloudhal/astro-renderer/components/Sections.astro";
import type { CollectionIndexHook } from "@cloudhal/astro-renderer/navigation";
import Testimonial from "./components/blocks/Testimonial.astro";
import LatestPosts from "./components/LatestPosts.astro";

/** The article lists on pages draw as cards with covers and reading time. */
export const components: SectionComponents = { contentList: LatestPosts };

/**
 * Block types (RFC-0015) rendered by this theme's own components, by type name: the types this
 * theme declares in `src/blocks.ts`, and any built-in it restyles, e.g.
 *   import Callout from "./components/Callout.astro";
 *   export const blocks = { callout: Callout, testimonial: Testimonial };
 * Each gets `{ props, content, contentHtml, media }` (and `section` on pages), in page sections
 * and inside article and rich-text bodies. Types not listed use Cloudhal's built-in markup.
 */
export const blocks: BlockComponents = { testimonial: Testimonial };

/** Entries per category/tag archive page (`/category/<slug>/page/<n>`). */
export const ARCHIVE_PAGE_SIZE = 20;

/**
 * Sites without a `primary` menu get a derived header: their top-level pages, then (with this
 * flag) the top-level categories (by `position`, then name) whose archive is served (active,
 * public, with posts). Set to `false` for a pages-only header. A `primary` menu replaces it.
 */
export const NAV_CATEGORIES = true;

/**
 * Where this theme serves a collection's index, for menu items that link to a collection
 * (RFC-0003 §7.1). Return `undefined` to use the default: the first published page that lists the
 * collection (the blog's home page lists `posts`); without one the item is hidden.
 */
export const collectionIndex: CollectionIndexHook = () => undefined;

/** "Related posts" under an article: entries sharing its primary category or tags (0 hides it). */
export const RELATED_POSTS = 3;

/** The few words the theme itself prints, per language (the content brings its own). */
const STRINGS = {
  en: {
    home: "Home",
    breadcrumb: "Breadcrumb",
    related: "Related posts",
    pagination: "Pagination",
    newer: "← Newer",
    older: "Older →",
    pageOf: (page: number, pages: number) => `Page ${page} of ${pages}`,
    feed: "RSS feed",
    posts: (n: number) => (n === 1 ? "1 post" : `${n} posts`),
    by: (name: string) => `By ${name}`,
    updated: (when: string) => `Updated ${when}`,
    minRead: (n: number) => `${n} min read`,
    onThisPage: "On this page",
    /** Previews of an embargoed or expired page or entry (RFC-0008 §7.3); readers never see these. */
    embargoed: (when: string) => `Embargoed until ${when}. Only previews show it until then.`,
    expired: (when: string) => `Expired on ${when}. Only previews show it now.`,
  },
  tr: {
    home: "Ana sayfa",
    breadcrumb: "Sayfa yolu",
    related: "İlgili yazılar",
    pagination: "Sayfalar",
    newer: "← Daha yeni",
    older: "Daha eski →",
    pageOf: (page: number, pages: number) => `Sayfa ${page} / ${pages}`,
    feed: "RSS beslemesi",
    posts: (n: number) => `${n} yazı`,
    by: (name: string) => name,
    updated: (when: string) => `Güncellendi: ${when}`,
    minRead: (n: number) => `${n} dk okuma`,
    onThisPage: "Bu sayfada",
    embargoed: (when: string) =>
      `${when} tarihine kadar ambargolu. O zamana kadar yalnızca önizlemede görünür.`,
    expired: (when: string) =>
      `${when} tarihinde yayından kalktı. Artık yalnızca önizlemede görünür.`,
  },
} as const;

export type ThemeStrings = (typeof STRINGS)[keyof typeof STRINGS];

export function strings(locale: string): ThemeStrings {
  const lang = (locale.split("-")[0] ?? locale) as keyof typeof STRINGS;
  return STRINGS[lang] ?? STRINGS.en;
}
