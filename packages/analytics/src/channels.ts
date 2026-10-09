/**
 * Channel classification (RFC-0006 §5.3): where a page view came from, decided by the server from
 * the referrer host and `utm_medium`. The table is versioned code; a change affects new events only
 * and is a changelog entry.
 */
import type { AnalyticsChannel } from "@cloudhal/core-contracts";

/** Bumped whenever the tables below change. */
export const CHANNEL_TABLE_VERSION = 1;

/** Hosts match exactly or as a parent domain (`l.facebook.com` matches `facebook.com`). */
const AI = [
  "chatgpt.com",
  "chat.openai.com",
  "perplexity.ai",
  "claude.ai",
  "gemini.google.com",
  "copilot.microsoft.com",
  "you.com",
];
const EMAIL = [
  "mail.google.com",
  "outlook.live.com",
  "outlook.office.com",
  "outlook.office365.com",
  "mail.yahoo.com",
  "mail.proton.me",
  "mail.aol.com",
  "app.fastmail.com",
  "mail.yandex.ru",
  "mail.yandex.com",
  "e.mail.ru",
  "mail.zoho.com",
  "icloud.com",
];
const SEARCH = [
  "bing.com",
  "duckduckgo.com",
  "baidu.com",
  "ecosia.org",
  "search.brave.com",
  "startpage.com",
  "qwant.com",
  "naver.com",
  "search.yahoo.com",
];
/** google.<tld> and yandex.<tld>, including two-part country TLDs (google.com.tr, yandex.com.tr). */
const SEARCH_RE = /^(?:[a-z0-9-]+\.)*(?:google|yandex)\.(?:[a-z]{2,3}|com?\.[a-z]{2})$/;
const SOCIAL = [
  "t.co",
  "x.com",
  "twitter.com",
  "facebook.com",
  "fb.com",
  "instagram.com",
  "linkedin.com",
  "lnkd.in",
  "reddit.com",
  "bsky.app",
  "threads.net",
  "youtube.com",
  "youtu.be",
  "news.ycombinator.com",
  "pinterest.com",
  "tiktok.com",
  "vk.com",
  "mastodon.social",
  "mastodon.online",
  "mstdn.social",
  "fosstodon.org",
  "hachyderm.io",
  "infosec.exchange",
];
/** Mastodon and other fediverse servers by name. */
const SOCIAL_RE = /^(?:mastodon|mstdn)\.[a-z0-9.-]+$/;

function within(host: string, list: readonly string[]): boolean {
  return list.some((h) => host === h || host.endsWith(`.${h}`));
}

/** Channel of an external referrer host (already lower-cased, without `www.`). */
export function channelOfHost(host: string): AnalyticsChannel {
  if (within(host, AI)) return "ai";
  if (within(host, EMAIL)) return "email";
  if (within(host, SEARCH) || SEARCH_RE.test(host)) return "search";
  if (within(host, SOCIAL) || SOCIAL_RE.test(host)) return "social";
  return "referral";
}

/** `utm_medium` overrides the table: email → email; cpc, ppc, paid* → paid; social → social. */
export function channelOfMedium(medium: string | undefined): AnalyticsChannel | undefined {
  if (!medium) return undefined;
  if (medium === "email" || medium === "e-mail" || medium === "newsletter") return "email";
  if (medium === "cpc" || medium === "ppc" || medium.startsWith("paid")) return "paid";
  if (medium === "social" || medium === "social-media") return "social";
  return undefined;
}

export interface ChannelInput {
  /** External referrer host, or `undefined`. */
  readonly refHost?: string | undefined;
  /** The referrer was one of the site's own hosts. */
  readonly internal: boolean;
  /** Normalised `utm_medium`. */
  readonly utmMedium?: string | undefined;
}

/** `internal` for own hosts; `direct` for no referrer; else the table; `utm_medium` overrides. */
export function classifyChannel(input: ChannelInput): AnalyticsChannel {
  if (input.internal) return "internal";
  const byMedium = channelOfMedium(input.utmMedium);
  if (byMedium) return byMedium;
  return input.refHost ? channelOfHost(input.refHost) : "direct";
}
