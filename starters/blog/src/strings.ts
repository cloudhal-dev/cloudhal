/**
 * The theme's own words per language (RFC-0033 §4a). It ships English, Turkish and Japanese; any
 * other language gets English, with the site's `strings` setting over it. Plain data, no components,
 * so tests import it directly.
 */
/** The few words the theme itself prints (the content brings its own). */
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
    /** RFC-0041 §9: the typed fields list on an article, and the words of yes/no fields. */
    details: "Details",
    yes: "Yes",
    no: "No",
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
    // The not-found page (404) when the site has no page at `/404` in the reader's language.
    notFoundTitle: "Page not found",
    notFoundText: "The page you are looking for doesn't exist or has moved.",
    notFoundHome: "Go to the home page",
    notFoundSearch: "Or search this site:",
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
    details: "Ayrıntılar",
    yes: "Evet",
    no: "Hayır",
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
    notFoundTitle: "Sayfa bulunamadı",
    notFoundText: "Aradığınız sayfa yok ya da taşınmış.",
    notFoundHome: "Ana sayfaya dön",
    notFoundSearch: "Ya da sitede arayın:",
  },
  ja: {
    home: "ホーム",
    breadcrumb: "パンくずリスト",
    related: "関連記事",
    pagination: "ページ送り",
    newer: "← 新しい記事",
    older: "古い記事 →",
    pageOf: (page: number, pages: number) => `${pages} ページ中 ${page} ページ`,
    feed: "RSS フィード",
    posts: (n: number) => `${n} 件の記事`,
    by: (name: string) => `${name} 著`,
    byPrefix: "著者:",
    and: "、",
    updated: (when: string) => `${when} 更新`,
    minRead: (n: number) => `${n} 分で読めます`,
    onThisPage: "このページの内容",
    details: "詳細",
    yes: "はい",
    no: "いいえ",
    corrections: "訂正と更新",
    correctionKind: { correction: "訂正", clarification: "補足", update: "更新" },
    appended: (kind: string) => `${kind}を追記`,
    skipToContent: "本文へスキップ",
    mainMenu: "メイン",
    footerMenu: "フッター",
    legalMenu: "法的情報",
    socialLinks: "ソーシャルリンク",
    secondaryMenu: "サブメニュー",
    menu: "メニュー",
    closeMenu: "メニューを閉じる",
    announcement: "お知らせ",
    dismiss: "閉じる",
    privacy: "プライバシー",
    consentNotice: "このサイトは動作に必要なものだけを保存します。追跡用 Cookie は使いません。",
    consentChoices:
      "このサイトの一部は、ほかのサービスのコンテンツ(動画、地図)を読み込むことがあります。",
    consentOk: "OK",
    consentAll: "すべて許可",
    consentEssential: "必須のみ",
    privacyPolicy: "プライバシーポリシー",
    copied: "コピーしました",
    linkCopied: "リンクをコピーしました",
    builtWith: "Cloudhal で構築",
    search: "検索",
    searchLabel: "サイト内検索",
    searchPlaceholder: "サイト内を検索…",
    searchResults: (n: number, q: string) => `「${q}」の検索結果 ${n} 件`,
    searchNone: (q: string) =>
      `「${q}」に一致するものはありません。言葉を減らすか、別の言葉でお試しください。`,
    searchUpdating: "検索は最新の変更を反映している途中です。",
    searchModal: {
      kinds: { article: "記事", page: "ページ", term: "トピック", author: "著者" },
      all: "「{q}」の検索結果をすべて見る",
      none: "「{q}」に一致するものはありません。",
      recent: "最近の検索",
      clear: "最近の検索を消去",
      limited: "現在、検索が集中しています。",
      error: "現在、検索を利用できません。",
      updating: "検索は最新の変更を反映している途中です。",
      count: { one: "# 件", other: "# 件" },
      close: "閉じる",
      keys: { move: "移動", open: "開く", close: "閉じる" },
    },
    previous: "← 前へ",
    next: "次へ →",
    embargoed: (when: string) =>
      `${when} まで公開を控えています。それまではプレビューでのみ表示されます。`,
    expired: (when: string) =>
      `${when} に掲載期限が切れました。現在はプレビューでのみ表示されます。`,
    machineTranslated: "このページは自動翻訳されたもので、まだ確認されていません。",
    machineReviewed: "このページは自動翻訳され、人が確認しました。",
    readOriginal: "原文を読む",
    notTranslated: "このページはまだお使いの言語で読めないため、元の言語で表示しています。",
    languages: "言語",
    notFoundTitle: "ページが見つかりません",
    notFoundText: "お探しのページは存在しないか、移動しました。",
    notFoundHome: "ホームページへ",
    notFoundSearch: "またはサイト内を検索:",
  },
} as const;

export type ThemeStrings = (typeof STRINGS)[keyof typeof STRINGS];

/**
 * The theme's words in `locale` (its language subtag; English for a language the theme does not
 * ship, and for any word a shipped language lacks), with the site's own wording over them
 * (`strings` in the theme settings, RFC-0033 §4a: one item per language, matched on the full tag,
 * then the language): plain-text words only, the keys the settings declare.
 */
export function strings(locale: string, overrides?: unknown): ThemeStrings {
  const lang = (locale.split("-")[0] ?? locale).toLowerCase();
  const base: ThemeStrings = Object.hasOwn(STRINGS, lang)
    ? { ...STRINGS.en, ...STRINGS[lang as keyof typeof STRINGS] }
    : STRINGS.en;
  if (!Array.isArray(overrides)) return base;
  const words = base as Record<string, unknown>;
  const items = overrides as Array<Record<string, unknown> | null>;
  const item =
    items.find((o) => o?.locale === locale) ??
    items.find((o) => typeof o?.locale === "string" && o.locale.toLowerCase() === lang);
  if (!item) return base;
  const own = Object.fromEntries(
    Object.entries(item).filter(
      ([k, v]) => k !== "locale" && typeof v === "string" && v && typeof words[k] === "string",
    ),
  );
  return Object.keys(own).length ? ({ ...base, ...own } as ThemeStrings) : base;
}
