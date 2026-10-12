---
"@cloudhal/analytics": minor
"@cloudhal/mcp-server": minor
"@cloudhal/api": minor
---

"Possible bot traffic" (RFC-0006 §5.5). `assessBotTraffic(reader, { siteId, range, now })` and `AnalyticsService.botTraffic(siteId, range)` check the period's last 7 days by the hour and answer `{ level: "none" | "watch" | "likely", reasons: [{ code, detail, value, threshold, key? }], hour, pageviews, baseline, window, partial? }`: the busiest hour must have ≥ 200 page views and ≥ 10× the median hour (`hourly_spike`), corroborated by ≥ 80 % direct entrances out of ≥ 50 (`direct_entrances`) or one browser family with ≥ 95 % (`single_browser`); one page with ≥ 90 % (`single_page`) is reported but never warns alone. `likely` is the RFC's 20× with direct entrances (or 20× with one browser on one page), `watch` 10×. It reuses existing query shapes (one hourly series, three one-hour top lists only on a spike), so the WAE statements are the ones verified live; `describeBotTrafficConformance` runs it on every store. REST adds `GET /api/sites/:siteId/analytics/bots` (`analytics:read`), `get_analytics` returns `botTraffic`, both with a `single_page` reason joined to the graph. Studio shows an alert banner on the Analytics screen for `watch` and `likely`, with the reasons behind "Why this warning" and "Show that day".
