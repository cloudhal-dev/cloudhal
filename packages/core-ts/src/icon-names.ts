/**
 * The curated icon set (RFC-0026 §1): every name agents and themes may use, its group, where its
 * drawing comes from, and whether it points (and so flips right-to-left). Hand-edited: adding a
 * name is a reviewed change; a released name keeps its meaning. `scripts/gen-icons.ts` reads this
 * list and writes `generated/icons-data.ts`.
 */

export interface IconSource {
  /** `phosphor:<file>` (regular weight) or `simple:<file>` (`icons/simple-icons/<file>.svg`). */
  readonly from: string;
  /** It points: mirrored under `[dir=rtl]`. */
  readonly mirror?: true;
}

const p = (file: string, mirror?: true): IconSource => ({
  from: `phosphor:${file}`,
  ...(mirror ? { mirror } : {}),
});

/** Navigation and the page's own controls. */
const INTERFACE = {
  menu: p("list"),
  close: p("x"),
  search: p("magnifying-glass"),
  "chevron-down": p("caret-down"),
  "chevron-up": p("caret-up"),
  "chevron-left": p("caret-left", true),
  "chevron-right": p("caret-right", true),
  "arrow-right": p("arrow-right", true),
  "arrow-left": p("arrow-left", true),
  "arrow-up": p("arrow-up"),
  "arrow-down": p("arrow-down"),
  "arrow-up-right": p("arrow-up-right", true),
  external: p("arrow-square-out", true),
  plus: p("plus"),
  minus: p("minus"),
  more: p("dots-three"),
  home: p("house"),
  globe: p("globe"),
  sun: p("sun"),
  moon: p("moon"),
} as const;

/** What a reader can do, and how things stand. */
const ACTIONS = {
  check: p("check"),
  "check-circle": p("check-circle"),
  info: p("info"),
  warning: p("warning"),
  error: p("warning-circle"),
  question: p("question"),
  download: p("download-simple"),
  upload: p("upload-simple"),
  copy: p("copy"),
  share: p("share-network"),
  link: p("link"),
  edit: p("pencil-simple"),
  trash: p("trash"),
  filter: p("funnel"),
  sort: p("sort-ascending"),
  settings: p("gear"),
  lock: p("lock"),
  unlock: p("lock-open"),
  eye: p("eye"),
  bell: p("bell"),
  refresh: p("arrows-clockwise"),
  print: p("printer"),
  play: p("play"),
  pause: p("pause"),
  sparkle: p("sparkle"),
} as const;

/** Things and topics a page talks about. */
const CONTENT = {
  mail: p("envelope-simple"),
  phone: p("phone"),
  chat: p("chat-circle"),
  "map-pin": p("map-pin"),
  calendar: p("calendar-blank"),
  clock: p("clock"),
  user: p("user"),
  users: p("users"),
  building: p("buildings"),
  briefcase: p("briefcase"),
  cart: p("shopping-cart"),
  tag: p("tag"),
  gift: p("gift"),
  "credit-card": p("credit-card"),
  money: p("money"),
  chart: p("chart-bar"),
  "trend-up": p("trend-up"),
  lightning: p("lightning"),
  star: p("star"),
  heart: p("heart"),
  quote: p("quotes"),
  book: p("book-open"),
  article: p("article"),
  image: p("image"),
  video: p("video-camera"),
  music: p("music-note"),
  file: p("file"),
  folder: p("folder"),
  code: p("code"),
  rocket: p("rocket-launch"),
  leaf: p("leaf"),
  coffee: p("coffee"),
  graduation: p("graduation-cap"),
  shield: p("shield-check"),
  target: p("target"),
  lightbulb: p("lightbulb"),
} as const;

/** The networks of `Site.brand.social` (RFC-0025), shown monochrome and unaltered. */
const SOCIAL = {
  x: p("x-logo"),
  bluesky: { from: "simple:bluesky" },
  mastodon: p("mastodon-logo"),
  github: p("github-logo"),
  linkedin: p("linkedin-logo"),
  instagram: p("instagram-logo"),
  facebook: p("facebook-logo"),
  youtube: p("youtube-logo"),
  tiktok: p("tiktok-logo"),
  threads: p("threads-logo"),
  rss: p("rss"),
  email: p("envelope-simple"),
} as const;

export const ICON_SOURCES = { ...INTERFACE, ...ACTIONS, ...CONTENT, ...SOCIAL } as const;
export type IconName = keyof typeof ICON_SOURCES;
export const ICON_GROUPS: Readonly<
  Record<"interface" | "actions" | "content" | "social", readonly IconName[]>
> = {
  interface: Object.keys(INTERFACE) as IconName[],
  actions: Object.keys(ACTIONS) as IconName[],
  content: Object.keys(CONTENT) as IconName[],
  social: Object.keys(SOCIAL) as IconName[],
};
export const ICON_NAMES = Object.keys(ICON_SOURCES) as readonly IconName[];
