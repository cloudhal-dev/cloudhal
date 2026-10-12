/**
 * User-agent classification (RFC-0006 §5.3): device class, browser and OS families (never
 * versions), and known crawlers with their class. The user agent is only read, never stored.
 * The table is code: a change is a changelog entry and affects new events only.
 */
import type { AnalyticsBrowser, AnalyticsDevice, AnalyticsOs } from "@cloudhal/core-contracts";
import type { CrawlerClass } from "./model.ts";

/** Bumped whenever the tables below change. */
export const UA_TABLE_VERSION = 1;

export interface Crawler {
  /** Stored name (`AnalyticsCrawlerName`): lower case, `[a-z0-9-]`. */
  readonly name: string;
  readonly class: CrawlerClass;
}

/** Known crawlers, most specific first. */
const CRAWLERS: readonly (Crawler & { re: RegExp })[] = [
  { name: "chatgpt-user", class: "ai", re: /ChatGPT-User/i },
  { name: "oai-searchbot", class: "ai", re: /OAI-SearchBot/i },
  { name: "gptbot", class: "ai", re: /GPTBot/i },
  { name: "claude-user", class: "ai", re: /Claude-User/i },
  { name: "claude-searchbot", class: "ai", re: /Claude-SearchBot/i },
  { name: "claudebot", class: "ai", re: /ClaudeBot/i },
  { name: "perplexity-user", class: "ai", re: /Perplexity-User/i },
  { name: "perplexitybot", class: "ai", re: /PerplexityBot/i },
  { name: "ccbot", class: "ai", re: /CCBot/i },
  { name: "bytespider", class: "ai", re: /Bytespider/i },
  { name: "amazonbot", class: "ai", re: /Amazonbot/i },
  { name: "meta-externalagent", class: "ai", re: /meta-externalagent/i },
  { name: "googlebot", class: "search", re: /Googlebot/i },
  { name: "bingbot", class: "search", re: /bingbot/i },
  { name: "applebot", class: "search", re: /Applebot/i },
  { name: "duckduckbot", class: "search", re: /DuckDuckBot/i },
  { name: "yandexbot", class: "search", re: /YandexBot/i },
  { name: "baiduspider", class: "search", re: /Baiduspider/i },
  { name: "facebookexternalhit", class: "social", re: /facebookexternalhit/i },
  { name: "twitterbot", class: "social", re: /Twitterbot/i },
  { name: "linkedinbot", class: "social", re: /LinkedInBot/i },
  { name: "slackbot", class: "social", re: /Slackbot/i },
  { name: "discordbot", class: "social", re: /Discordbot/i },
  { name: "uptimerobot", class: "monitor", re: /UptimeRobot/i },
  { name: "pingdom", class: "monitor", re: /Pingdom/i },
];

/** Anything automated that is not a named crawler: bots, headless browsers, HTTP libraries. */
const GENERIC_BOT =
  /bot\b|bot\/|crawl|spider|slurp|scrape|headless|phantomjs|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|curl\/|wget\/|python-requests|python-urllib|python\/|httpx|aiohttp|go-http-client|java\/|okhttp|axios\/|node-fetch|undici|libwww|scrapy|httpclient|guzzle|postman|insomnia|monitor|preview|fetcher|checker|validator/i;

export interface UaClass {
  readonly device: AnalyticsDevice;
  readonly browser: AnalyticsBrowser;
  readonly os: AnalyticsOs;
  /** Set for named crawlers only; generic bots have `device: "bot"` and no crawler. */
  readonly crawler?: Crawler;
}

export interface ClientHints {
  /** `Sec-CH-UA-Mobile` (`?1` / `?0`). */
  readonly mobile?: string | null;
  /** `Sec-CH-UA-Platform` (e.g. `"Windows"`). */
  readonly platform?: string | null;
}

/** The class of a stored crawler name ("other" for names no longer in the table). */
export function crawlerClass(name: string): CrawlerClass {
  return CRAWLERS.find((c) => c.name === name)?.class ?? "other";
}

/** Named crawlers, for documentation and Studio legends. */
export function knownCrawlers(): readonly Crawler[] {
  return CRAWLERS.map(({ name, class: c }) => ({ name, class: c }));
}

function osOf(ua: string, platform: string | undefined): AnalyticsOs {
  switch (platform) {
    case "windows":
      return "windows";
    case "macos":
      return "macos";
    case "ios":
      return "ios";
    case "android":
      return "android";
    case "chrome os":
    case "chromeos":
      return "chromeos";
    case "linux":
      return "linux";
  }
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/CrOS/.test(ua)) return "chromeos";
  if (/Macintosh|Mac OS X/.test(ua)) return "macos";
  if (/Linux|X11/.test(ua)) return "linux";
  return "other";
}

function browserOf(ua: string): AnalyticsBrowser {
  if (/Edg(e|A|iOS)?\//.test(ua)) return "edge";
  if (/SamsungBrowser\//.test(ua)) return "samsung";
  if (/OPR\/|Opera|OPiOS\//.test(ua)) return "opera";
  if (/Firefox\/|FxiOS\//.test(ua)) return "firefox";
  if (/Chrome\/|CriOS\/|Chromium\//.test(ua)) return "chrome";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "safari";
  return "other";
}

function deviceOf(ua: string, os: AnalyticsOs, mobileHint: string | undefined): AnalyticsDevice {
  if (/iPad|Tablet|PlayBook|Silk\//.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)))
    return "tablet";
  if (mobileHint === "?1" || /Mobi|iPhone|iPod|Android.*Mobile|Windows Phone/.test(ua))
    return "mobile";
  if (os === "windows" || os === "macos" || os === "linux" || os === "chromeos") return "desktop";
  return "unknown";
}

/** Classifies a user agent and client hints. An empty or missing UA is `unknown`. */
export function classifyUserAgent(ua: string | null | undefined, hints: ClientHints = {}): UaClass {
  const s = (ua ?? "").slice(0, 512);
  const platform = hints.platform?.replace(/"/g, "").trim().toLowerCase() || undefined;
  const mobile = hints.mobile?.trim() || undefined;
  if (!s.trim()) return { device: "unknown", browser: "other", os: osOf("", platform) };
  const os = osOf(s, platform);
  const browser = browserOf(s);
  const known = CRAWLERS.find((c) => c.re.test(s));
  if (known)
    return { device: "bot", browser, os, crawler: { name: known.name, class: known.class } };
  if (GENERIC_BOT.test(s)) return { device: "bot", browser, os };
  return { device: deviceOf(s, os, mobile), browser, os };
}
