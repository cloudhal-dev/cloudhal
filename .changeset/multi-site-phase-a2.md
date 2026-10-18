---
"@cloudhal/storage": minor
"@cloudhal/agent-runtime": minor
"@cloudhal/api": minor
"@cloudhal/mcp-server": minor
"@cloudhal/core-ts": patch
---

Per-site roles (RFC-0034 phase A2 / ADR-0036). Owners and Administrators still work on every site. An Editor, Author or Contributor can now be limited to some sites, with a role per site. Members without a limit keep their role on every site, as before.

**Storage**
- Migration `0028_site_members` adds `site_members`, and `invitation.sites` for invites that carry a limit.

**agent-runtime**
- `forSite(principal, siteId)` gives the principal that site's role, or `undefined` when the person may not open the site.
- An agent key is narrowed to the site role again, and its mode is capped by that role.
- `forInstallation` removes the installation-wide scopes from a site-limited person: `members:invite`, `members:manage`, `agents:manage` and `audit:read`.
- Also new: `visibleSites` and `isSiteLimited`.

**API**
- **Route guard:** under `/api/sites/:siteId`, a site-limited person acts with that site's role. A site they are not on answers 404.
- **Filtered for site-limited people:**
  - `GET /api/sites`;
  - notifications;
  - approval decisions;
  - members, who are shown only when they share a site.
- **Assigning sites:**
  - new route `PUT /api/members/:userId/sites` ← `{sites: {siteId: role}}`; `{}` lifts the limit;
  - invites accept `sites`;
  - promoting someone to Administrator drops their site rows.
- **`/api/me`:** returns `sites`, and with `?siteId=` that site's role and abilities.

**MCP**
- Every tool call with a `siteId` runs with that site's role. Another site answers `not_found`.
- `list_sites` lists only the person's sites.

**core-ts**
- Deleting a site also removes its `site_members` rows.
