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
    byPrefix: "By ",
    and: " and ",
    updated: (when: string) => `Updated ${when}`,
    minRead: (n: number) => `${n} min read`,
    onThisPage: "On this page",
    /** RFC-0019 §2: the corrections list at the end of an article, and the note under the byline. */
    corrections: "Corrections and updates",
    correctionKind: { correction: "Correction", clarification: "Clarification", update: "Update" },
    appended: (kind: string) => `${kind} appended`,
    /** RFC-0019 §3: the search form in the header and the search page. */
    /** RFC-0025: the header and footer's own words. */
    skipToContent: "Skip to content",
    mainMenu: "Main",
    footerMenu: "Footer",
    legalMenu: "Legal",
    socialLinks: "Social links",
    secondaryMenu: "Secondary",
    menu: "Menu",
    closeMenu: "Close menu",
    announcement: "Announcement",
    dismiss: "Dismiss",
    privacy: "Privacy",
    consentNotice: "This site keeps only what it needs to work: no tracking cookies.",
    consentChoices: "Some parts of this site can load content from other services (videos, maps).",
    consentOk: "OK",
    consentAll: "Allow all",
    consentEssential: "Only essential",
    privacyPolicy: "Privacy policy",
    copied: "Copied",
    linkCopied: "Link copied",
    builtWith: "Built with Cloudhal",
    search: "Search",
    searchLabel: "Search this site",
    searchPlaceholder: "Search the site…",
    searchResults: (n: number, q: string) =>
      n === 1 ? `1 result for “${q}”` : `${n} results for “${q}”`,
    searchNone: (q: string) => `Nothing matches “${q}”. Try fewer or other words.`,
    searchUpdating: "Search is catching up with the latest changes.",
    /** RFC-0029 §6: the search modal's words (`data-words`; `{q}` is the query, `#` the count). */
    searchModal: {
      kinds: { article: "Articles", page: "Pages", term: "Topics", author: "Authors" },
      all: "See all results for “{q}”",
      none: "Nothing matches “{q}”.",
      recent: "Recent searches",
      clear: "Clear recent searches",
      limited: "Too many searches right now.",
      error: "Search is unavailable right now.",
      updating: "Search is catching up with the latest changes.",
      count: { one: "# result", other: "# results" },
      close: "Close",
      keys: { move: "move", open: "open", close: "close" },
    },
    previous: "← Previous",
    next: "Next →",
    /** Previews of an embargoed or expired page or entry (RFC-0008 §7.3); readers never see these. */
    embargoed: (when: string) => `Embargoed until ${when}. Only previews show it until then.`,
    expired: (when: string) => `Expired on ${when}. Only previews show it now.`,
    // RFC-0033: the reader's notice on machine translations, the fallback notice, the switcher.
    machineTranslated: "This page was translated automatically and has not been reviewed yet.",
    machineReviewed: "This page was translated automatically and reviewed by a person.",
    readOriginal: "Read the original",
    notTranslated:
      "This page isn't available in your language yet, so it is shown in its original language.",
    languages: "Languages",
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
    byPrefix: "",
    and: " ve ",
    updated: (when: string) => `Güncellendi: ${when}`,
    minRead: (n: number) => `${n} dk okuma`,
    onThisPage: "Bu sayfada",
    corrections: "Düzeltmeler ve güncellemeler",
    correctionKind: { correction: "Düzeltme", clarification: "Açıklama", update: "Güncelleme" },
    appended: (kind: string) => `${kind} eklendi`,
    skipToContent: "İçeriğe geç",
    mainMenu: "Ana menü",
    footerMenu: "Alt menü",
    legalMenu: "Yasal",
    socialLinks: "Sosyal bağlantılar",
    secondaryMenu: "İkincil menü",
    menu: "Menü",
    closeMenu: "Menüyü kapat",
    announcement: "Duyuru",
    dismiss: "Kapat",
    privacy: "Gizlilik",
    consentNotice: "Bu site yalnızca çalışması için gerekeni saklar: izleme çerezi yok.",
    consentChoices:
      "Bu sitenin bazı bölümleri başka servislerden içerik yükleyebilir (videolar, haritalar).",
    consentOk: "Tamam",
    consentAll: "Tümüne izin ver",
    consentEssential: "Yalnız gerekli",
    privacyPolicy: "Gizlilik politikası",
    copied: "Kopyalandı",
    linkCopied: "Bağlantı kopyalandı",
    builtWith: "Cloudhal ile yapıldı",
    search: "Ara",
    searchLabel: "Sitede ara",
    searchPlaceholder: "Sitede ara…",
    searchResults: (n: number, q: string) => `“${q}” için ${n} sonuç`,
    searchNone: (q: string) =>
      `“${q}” ile eşleşen bir şey yok. Daha az ya da başka sözcükler deneyin.`,
    searchUpdating: "Arama son değişiklikleri eklemeye devam ediyor.",
    searchModal: {
      kinds: { article: "Yazılar", page: "Sayfalar", term: "Konular", author: "Yazarlar" },
      all: "“{q}” için tüm sonuçlar",
      none: "“{q}” ile eşleşen bir şey yok.",
      recent: "Son aramalar",
      clear: "Son aramaları temizle",
      limited: "Şu anda çok fazla arama yapıldı.",
      error: "Arama şu anda kullanılamıyor.",
      updating: "Arama son değişiklikleri eklemeye devam ediyor.",
      count: { one: "# sonuç", other: "# sonuç" },
      close: "Kapat",
      keys: { move: "gez", open: "aç", close: "kapat" },
    },
    previous: "← Önceki",
    next: "Sonraki →",
    embargoed: (when: string) =>
      `${when} tarihine kadar ambargolu. O zamana kadar yalnızca önizlemede görünür.`,
    expired: (when: string) =>
      `${when} tarihinde yayından kalktı. Artık yalnızca önizlemede görünür.`,
    machineTranslated: "Bu sayfa otomatik olarak çevrildi ve henüz gözden geçirilmedi.",
    machineReviewed: "Bu sayfa otomatik olarak çevrildi ve bir kişi tarafından gözden geçirildi.",
    readOriginal: "Orijinalini oku",
    notTranslated: "Bu sayfa henüz dilinizde yok; bu yüzden orijinal dilinde gösteriliyor.",
    languages: "Diller",
  },
} as const;

export type ThemeStrings = (typeof STRINGS)[keyof typeof STRINGS];

/**
 * The theme's words in `locale`, with the site's own wording over them (`strings` in the theme
 * settings, RFC-0033 §4a: one item per language): plain-text words only, the keys the settings
 * declare.
 */
export function strings(locale: string, overrides?: unknown): ThemeStrings {
  const lang = (locale.split("-")[0] ?? locale) as keyof typeof STRINGS;
  const base = STRINGS[lang] ?? STRINGS.en;
  if (!Array.isArray(overrides)) return base;
  const words = base as Record<string, unknown>;
  const item =
    (overrides as Array<Record<string, unknown>>).find((o) => o?.locale === locale) ??
    (overrides as Array<Record<string, unknown>>).find((o) => o?.locale === lang);
  if (!item) return base;
  const own = Object.fromEntries(
    Object.entries(item).filter(
      ([k, v]) => k !== "locale" && typeof v === "string" && v && typeof words[k] === "string",
    ),
  );
  return Object.keys(own).length ? ({ ...base, ...own } as ThemeStrings) : base;
}
