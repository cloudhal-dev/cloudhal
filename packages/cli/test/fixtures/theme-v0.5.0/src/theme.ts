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
 * (RFC-0003 §7.1). Return `undefined` to use the default: a published page at the collection's
 * permalink prefix (`/docs` for `/docs/{slug}`, RFC-0038 §5), else the first published page that
 * lists the collection (the blog's home page lists `posts`); without one the item is hidden.
 */
export const collectionIndex: CollectionIndexHook = () => undefined;

/** "Related posts" under an article: entries sharing its primary category or tags (0 hides it). */
export const RELATED_POSTS = 3;

// The few words the theme itself prints, per language, and the site's own wording over them.
export { strings, type ThemeStrings } from "./strings.ts";
