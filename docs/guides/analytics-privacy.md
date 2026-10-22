# Site analytics and privacy: a guide for site owners

Every Cloudhal site can count its visits with its own analytics. They have no cookies, no third party and no API token. This page explains what is recorded and what never is, the two counting modes, how long data is kept, and how to switch analytics off. It also gives the paragraph for your privacy policy. The design is [RFC-0006](../rfcs/0006-site-analytics.md) ([ADR-0021](../adr/0021-site-analytics.md)); the security analysis is in the [threat model](../security/threat-model.md#site-analytics-rfc-0006).

## How it works
Published pages are served from Cloudflare's cache, where the site's server code does not run. So every published page carries one small script (about 1 KB) from the site's own address (`/_cloudhal/p.<hash>.js`). When the page is first visible, the script sends one short message to the same site (`POST /__cloudhal/e`). The site checks it, reduces it to the fields below and stores it in Workers Analytics Engine, which is part of your own Cloudflare account. On your own machine and on Node it is stored in the project's SQLite file instead. The site also records its own redirects, 404/410 errors and server errors.

Nothing is loaded from another company. The script stores nothing in the browser, reads no cookie and sends no identifier.

## What is recorded

| Recorded | Details |
|---|---|
| The page viewed | Only addresses of **published** pages, posts and archives. Views of drafts, previews or made-up addresses are dropped. Stats follow the article, so they survive a slug change. |
| Where the visit came from | The referring website's **domain name only** (`news.ycombinator.com`), never the full address. It is grouped into a channel: direct, internal, search, social, AI, email, paid or referral. |
| Campaign | `utm_source`, `utm_medium` and `utm_campaign`, lower-cased. Anything that is not a short token, such as an email address or a name, is dropped. No other part of the query string is ever read. |
| Country | Two letters, from Cloudflare (`XX` unknown, `T1` Tor). Never city, region, coordinates or network. |
| Device | Desktop, mobile or tablet; browser family (Chrome, Safari, …) and operating system family, without versions. |
| Page speed (sampled) | Core Web Vitals (LCP, INP, CLS, TTFB, FCP) from 1 in 5 page views by default. |
| Errors and redirects | The requested address of 404, 410 and redirect answers (without the query, at most 256 characters), the page that linked to it when it is on your site, and the names of known crawlers (Googlebot, GPTBot, ClaudeBot, …). |

## What is never recorded
- IP addresses. They are used only for a moment, to limit abuse (and, in the unique-visitors mode, to form the daily hash below), and then dropped.
- The browser's user agent string (only its family is kept).
- Cookies, `localStorage` or anything else on the visitor's device; no identifier of any kind.
- Full referrer URLs, query strings (other than the three campaign values), city or precise location.
- Who looked at what in Studio.

Studio, agents (MCP tools) and the CSV export only ever see totals. Nobody sees a list of individual visits.

## Visits and unique visitors
- **Visits** (always on). A visit starts when someone arrives from outside the site or with no referrer, on a fresh page load. Reloads, back/forward and clicks inside the site do not start a visit. Nothing identifies anyone.
- **Unique visitors** (off by default). An Administrator can switch it on in Studio (Site settings › Analytics › "Count unique visitors"). Each page view then gets a short hash of the visitor's IP address and browser details, mixed with a random value that is the same for one UTC day. The random value is deleted after that day, so nobody can trace a hash back to a visitor or link it across days. Unique visitors are counted per day and summed for longer periods ("daily unique visitors, summed"), so someone who comes back on two days counts twice.
  - This is processing of personal data, even though no IP is stored. Studio says so before the switch turns on, and you should mention it in your privacy policy (the paragraph below does).
  - Switching it off deletes today's random value at once. The value is shared by every site of the deployment, so other sites in this mode may count a returning visitor twice that day.
  - Switching it on counts unique visitors from that moment; earlier days stay without them.
  - The random value is deleted by the admin Worker's hourly job, which runs on the scheduler's tick: the cron trigger, or a Durable Object alarm when the account has no free cron trigger ([Schedules](schedules.md#the-scheduler)). The first salt of a new day also deletes every earlier one.

## Global Privacy Control and Do Not Track
When a browser sends Global Privacy Control (`Sec-GPC: 1`) or Do Not Track (`DNT: 1`), the page view and the visit are still counted, because they contain nothing personal, but **no hash is ever formed**, even in the unique-visitors mode. The unique-visitor figure is therefore a lower bound. Each page view keeps only a yes/no flag that a signal was present (not which one, and no header), so Studio's "About this data" can say what share of page views carried one.

## How long data is kept

| Data | Kept |
|---|---|
| Raw events on Cloudflare (Workers Analytics Engine) | 3 months, fixed by Cloudflare |
| Daily totals (D1 rollups) | Forever by default; 5, 2 or 1 years in Site settings › Analytics › "Keep daily totals" |
| Raw events on your own machine or Node (SQLite) | 90 days by default (`analytics.rawRetentionDays` in `cloudhal.json`) |
| The daily random value (unique-visitors mode) | Until the hourly job after its UTC day ends |

Raw events on Cloudflare expire by themselves. Daily totals older than the "Keep daily totals" period are deleted by the hourly job; there is no command yet that deletes all of a site's totals at once.

## Turning analytics off
- **For one site:** Studio › Site settings › Analytics › switch off "Count visits" (Administrators). Collection stops within a minute, and the site's cache is cleared so the script disappears from its pages.
- **For the whole deployment:** set `"analytics": { "enabled": false }` in `cloudhal.json` and run `cloudhal deploy`. That removes the Analytics Engine and SQL bindings, the hourly job and the script. The beacon address still answers, and does nothing. Daily totals already in D1 stay there.
- **Page speed only:** "Measure page speed" › Off. Fewer requests, no vitals.
- **Local development:** `cloudhal dev` records nothing unless `analytics.dev` is `true`.

An existing deployment that predates analytics is asked once, on its next interactive `cloudhal deploy`; a non-interactive deploy leaves analytics off.

## A paragraph for your privacy policy
Studio shows this text in Site settings › Analytics › "Privacy notice for your site", with a copy button, in the variant that matches your switches. Here it is in both languages. Use the second paragraph only when unique visitors are on.

**English**

> **Analytics**
>
> This site counts visits with its own cookie-free analytics, hosted with the rest of the site. We record which pages are viewed, the website or campaign that referred you (the domain name only), your country, and your device type and browser family. We do not use cookies or similar storage, do not store your IP address or browser details, and do not follow you across websites.
>
> To count unique visitors, your IP address and browser details are combined with a random value that is deleted every 24 hours, and only the result is kept; it cannot be traced back to you or linked across days. If your browser sends Global Privacy Control or Do Not Track, we count the visit but skip this step.

**Türkçe**

> **İstatistikler**
>
> Bu site ziyaretleri, sitenin geri kalanıyla birlikte barındırılan kendi çerezsiz istatistik aracıyla sayar. Hangi sayfaların görüntülendiğini, seni yönlendiren web sitesini ya da kampanyayı (yalnızca alan adını), ülkeni, cihaz türünü ve tarayıcı aileni kaydederiz. Çerez ya da benzeri bir depolama kullanmayız, IP adresini ya da tarayıcı bilgilerini saklamayız ve seni web siteleri arasında izlemeyiz.
>
> Tekil ziyaretçileri saymak için IP adresin ve tarayıcı bilgilerin her 24 saatte bir silinen rastgele bir değerle birleştirilir ve yalnızca sonuç saklanır; bu sonuç sana kadar geri izlenemez ve günler arasında eşleştirilemez. Tarayıcın Global Privacy Control ya da Do Not Track sinyali gönderirse ziyareti sayarız ama bu adımı atlarız.

The source of these strings is `apps/studio/src/i18n/lazy/analyticsSettings.en.ts` and `analyticsSettings.tr.ts` (`analyticsSettings.notice`). If they change there, change them here too.

## Requests from visitors
In the default mode nothing is stored about a person, so there is nothing to export or delete per person. In the unique-visitors mode, the stored hash cannot be recomputed once its day's random value is deleted, so it cannot be matched to a request either. Site-level daily totals can be exported as CSV (`cloudhal analytics export`).

## GDPR and KVKK notes

> **Not legal advice.** These notes describe how Cloudhal's analytics work so you and your adviser can assess them. Whether your site needs consent, a notice or a legal basis is your decision.

- **Default mode (visits, no hash).** Nothing is stored on or read from the visitor's device, no identifier is derived, and IP addresses are used only transiently to limit abuse. The data is aggregated, used only by you, and not shared. Cloudflare hosts the deployment as your processor. This matches the conditions that guidance such as the CNIL's audience-measurement exemption describes for measurement without consent: own use only, no cross-site tracking, minimised data, limited retention. The EDPB's Guidelines 2/2023 extend ePrivacy Art. 5(3) beyond cookies to URL- and pixel-based tracking, so "cookie-free" alone is not the test; this is why the script stores nothing and sends no identifier.
- **Unique-visitors mode.** IP address and user agent are processed for a moment to form a daily pseudonymous hash. Under GDPR and KVKK that is processing of personal data even though nothing identifying is kept. Owners usually rely on legitimate interest and should say so in the privacy policy.
- **Türkiye (KVKK).** The KVKK cookie guide (2022-06-20) is about cookies; Cloudhal sets none, so the default mode carries low risk. If you turn on unique visitors, take advice on the transient IP processing.
- **Where the data is.** Events stay in your own Cloudflare account (Workers Analytics Engine and D1), or in your own SQLite file. Cloudhal adds no other processor. Anyone with access to that account or file can read the raw events.
