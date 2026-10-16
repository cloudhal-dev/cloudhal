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

/**
 * Names models and other catalogs use for icons in the set (RFC-0026 §3): the repair and the A2UI
 * import map them; anything else stays an error. Keys are normalized (lower case, `-` between words).
 */
export const ICON_ALIASES: Readonly<Record<string, IconName>> = {
  hamburger: "menu",
  bars: "menu",
  times: "close",
  "x-mark": "close",
  xmark: "close",
  cross: "close",
  dismiss: "close",
  magnifier: "search",
  "magnifying-glass": "search",
  find: "search",
  "caret-down": "chevron-down",
  "caret-up": "chevron-up",
  "caret-left": "chevron-left",
  "caret-right": "chevron-right",
  "expand-more": "chevron-down",
  "expand-less": "chevron-up",
  "arrow-forward": "arrow-right",
  "arrow-back": "arrow-left",
  "external-link": "external",
  "open-in-new": "external",
  launch: "external",
  add: "plus",
  remove: "minus",
  dots: "more",
  ellipsis: "more",
  "more-horiz": "more",
  "more-vert": "more",
  kebab: "more",
  house: "home",
  earth: "globe",
  world: "globe",
  language: "globe",
  "light-mode": "sun",
  "dark-mode": "moon",
  checkmark: "check",
  tick: "check",
  done: "check",
  "circle-check": "check-circle",
  success: "check-circle",
  "check-circle-outline": "check-circle",
  alert: "warning",
  caution: "warning",
  "x-circle": "error",
  "error-outline": "error",
  help: "question",
  "question-mark": "question",
  "help-circle": "question",
  "info-circle": "info",
  "cloud-download": "download",
  "cloud-upload": "upload",
  clipboard: "copy",
  send: "share",
  chain: "link",
  pencil: "edit",
  delete: "trash",
  bin: "trash",
  garbage: "trash",
  funnel: "filter",
  cog: "settings",
  gear: "settings",
  preferences: "settings",
  padlock: "lock",
  "lock-open": "unlock",
  visibility: "eye",
  view: "eye",
  notifications: "bell",
  notification: "bell",
  reload: "refresh",
  sync: "refresh",
  printer: "print",
  stars: "sparkle",
  sparkles: "sparkle",
  magic: "sparkle",
  envelope: "mail",
  inbox: "mail",
  telephone: "phone",
  call: "phone",
  message: "chat",
  comment: "chat",
  comments: "chat",
  location: "map-pin",
  pin: "map-pin",
  "map-marker": "map-pin",
  "location-on": "map-pin",
  place: "map-pin",
  "calendar-today": "calendar",
  event: "calendar",
  date: "calendar",
  time: "clock",
  schedule: "clock",
  person: "user",
  account: "user",
  "account-circle": "user",
  profile: "user",
  avatar: "user",
  people: "users",
  team: "users",
  group: "users",
  office: "building",
  company: "building",
  work: "briefcase",
  "shopping-cart": "cart",
  basket: "cart",
  bag: "cart",
  label: "tag",
  present: "gift",
  card: "credit-card",
  payment: "credit-card",
  dollar: "money",
  currency: "money",
  price: "money",
  pricing: "money",
  "bar-chart": "chart",
  graph: "chart",
  analytics: "chart",
  stats: "chart",
  "trending-up": "trend-up",
  growth: "trend-up",
  bolt: "lightning",
  flash: "lightning",
  zap: "lightning",
  fast: "lightning",
  favorite: "heart",
  love: "heart",
  quotes: "quote",
  "format-quote": "quote",
  docs: "book",
  documentation: "book",
  "book-open": "book",
  photo: "image",
  picture: "image",
  gallery: "image",
  camera: "video",
  film: "video",
  movie: "video",
  audio: "music",
  document: "file",
  directory: "folder",
  terminal: "code",
  developer: "code",
  ship: "rocket",
  startup: "rocket",
  plant: "leaf",
  nature: "leaf",
  eco: "leaf",
  cafe: "coffee",
  tea: "coffee",
  school: "graduation",
  education: "graduation",
  learn: "graduation",
  security: "shield",
  secure: "shield",
  protect: "shield",
  goal: "target",
  aim: "target",
  idea: "lightbulb",
  bulb: "lightbulb",
  twitter: "x",
  "x-twitter": "x",
  feed: "rss",
};

/** A name as models write it (`ArrowForward`, `icon-mail`, `fa-envelope`) in the set's spelling. */
export function normalizeIconName(raw: string): string {
  return raw
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/^(?:icon|ph|fa|fas|far|bi|mdi|lucide|heroicon|material)-/, "")
    .replace(/-(?:icon|outline|outlined|filled|fill|solid|regular|alt)$/, "");
}

/** Whether a string is a name of the set. */
export function isIconNameValue(v: unknown): v is IconName {
  return typeof v === "string" && (ICON_NAMES as readonly string[]).includes(v);
}

/** The set's name for what a model or another catalog wrote, or undefined. */
export function nearestIcon(raw: unknown): IconName | undefined {
  if (typeof raw !== "string") return undefined;
  const n = normalizeIconName(raw);
  if ((ICON_NAMES as readonly string[]).includes(n)) return n as IconName;
  return ICON_ALIASES[n];
}
