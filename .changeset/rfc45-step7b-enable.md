---
"@cloudhal/core-ts": patch
"@cloudhal/storage": patch
"@cloudhal/cloudflare": patch
"@cloudhal/api": patch
"@cloudhal/cli": patch
"@cloudhal/mcp-server": patch
---

RFC-0045 rollout step 7b: **reference and repeater fields are now enabled.** Sites can define `reference` fields (entries of one to five collections of the same site, one or several, with optional conditions) and `repeater` fields (ordered lists of items with up to ten flat sub-fields) wherever the renderer serving them reads the two types. See [docs/guides/fields.md](https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/fields.md).

- **Where.** On Cloudflare, once the site Worker serving the site answers `GET /__cloudhal/features` with `fields: 2` (0.9.0 and later): the admin Worker asks the Worker each site is routed to (`SITE`, or an attached `SITE_n`), as it asks for time gates, and remembers a yes for that Worker only. Time gates are now confirmed per site Worker too, so a site on an older attached Worker no longer inherits the installation Worker's answer. Deploy the site Worker first; until it reports `fields: 2`, the types stay refused with `fields_unsupported` on every path. On Node (`cloudhal dev`, `studio`, self-host, Docker) and in the playground, always, since the renderer runs in the same process (`openLocalStore` passes `FIELDS_SUPPORTED`).
- **Every write path follows the capability:** Studio, MCP, the API, field operations and their dry runs, and every bundle: `cloudhal push` (the admin route passes the store's capability), `pull`, `cloudhal import` (dry runs included), `--replace` and `--revert`. A bundle that defines either type is still refused whole where the capability does not hold, and a site's new snapshot cannot point at another site's held site body to bring the types in.
- **MCP and Studio.** `update_collection` and `change_field_type` list both types, and `/api/instance` answers `features.referenceFields: true`, on servers that have the capability. The store still decides per site.
- **A one-time `entry_refs` check per site** (`rebuildEntryRefs`, new core-ts export): the admin Worker's new `refs.rebuild` system job (every five minutes, offset from `lists.backfill`, until every site is done; then two reads a run), and `openLocalStore` at start-up. Rows are written per entry, anchored on the hash each entry was read with, so a concurrent edit keeps its own rows; each chunk is anchored on the site node's hash, so no statement grows with the site's settings; it leaves a site alone while a text ↔ reference type change runs there; progress is in the new `entry_refs_state` table (storage migration `0034_entry_refs_state`), so a run stopped anywhere resumes. It is a safety net and should find nothing to change.
