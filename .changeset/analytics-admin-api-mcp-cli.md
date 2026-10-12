---
"@cloudhal/analytics": minor
"@cloudhal/cloudflare": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/cli": minor
---

Site analytics for people, agents and operators (RFC-0006 rollout steps 6–9).

- `@cloudhal/analytics/service`: `AnalyticsService`, one object per deployment for the composite read path, settings with CAS (today's salt deleted when unique visitors turn off; a cache purge when `enabled` or vitals sampling change), the rollup job (scheduled or on read), status with the query budget and yesterday's Workers Free request estimate, and the site-level CSV export of daily rollups. Also range presets (`today`, `7d`, `30d`, `90d`, `12m`), `filter=` parsing and `demoEvents` for demo data.
- `@cloudhal/cloudflare`: the admin Worker has a `scheduled` handler (hourly: old salts deleted, one finished site-day rolled up from Workers Analytics Engine) and reads WAE through the optional `ANALYTICS_SQL` binding — no API token; without it analytics are recorded but not readable ("can't read yet"), never a crash. `/api/instance` reports `features.analytics`.
- `@cloudhal/api`: `/api/sites/:siteId/analytics/*` — `status`, `summary` (`compare=previous`), `series`, `top/:dimension` (top content joined to the current graph), `vitals`, `renders/:report`, `nodes/:nodeId`, `export` (CSV) and `settings` (`analytics:read`), `PUT settings` (`site:settings`, CAS on `rev`, audited as `analytics.settings`); deploy-token routes for the backfill, status and export. REST stays people-only.
- `@cloudhal/mcp-server`: read-only tools `get_analytics`, `top_content`, `content_stats` and `broken_links` (scope `analytics:read`, every mode, never gated); `@cloudhal/mcp-server/analytics` holds the reports REST shares.
- `@cloudhal/cli`: `cloudhal.json` → `analytics`; `cloudhal init` turns analytics on for new projects; `cloudhal deploy` generates the WAE dataset and Analytics SQL bindings, vars and the hourly cron (wrangler ≥ 4.145), asks existing projects once in a terminal (non-interactive: off), survives the cron-trigger limit, and purges the site cache once when analytics switch on or off; `cloudhal analytics status|rollup|seed|export` (local, or `--remote` over the deployment token); `cloudhal studio` and `cloudhal mcp` read the project's SQLite.
