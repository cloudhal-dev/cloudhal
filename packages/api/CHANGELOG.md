# @cloudhal/api

## 0.9.1

### Patch Changes

- 74d7098: RFC-0045 rollout step 7b: **reference and repeater fields are now enabled.** Sites can define `reference` fields (entries of one to five collections of the same site, one or several, with optional conditions) and `repeater` fields (ordered lists of items with up to ten flat sub-fields) wherever the renderer serving them reads the two types. See [docs/guides/fields.md](https://github.com/cloudhal-dev/cloudhal/blob/main/docs/guides/fields.md).
  
  - **Where.** On Cloudflare, once the site Worker serving the site answers `GET /__cloudhal/features` with `fields: 2` (0.9.0 and later): the admin Worker asks the Worker each site is routed to (`SITE`, or an attached `SITE_n`), as it asks for time gates, and remembers a yes for that Worker only. Time gates are now confirmed per site Worker too, so a site on an older attached Worker no longer inherits the installation Worker's answer. Deploy the site Worker first; until it reports `fields: 2`, the types stay refused with `fields_unsupported` on every path. On Node (`cloudhal dev`, `studio`, self-host, Docker) and in the playground, always, since the renderer runs in the same process (`openLocalStore` passes `FIELDS_SUPPORTED`).
  - **Every write path follows the capability:** Studio, MCP, the API, field operations and their dry runs, and every bundle: `cloudhal push` (the admin route passes the store's capability), `pull`, `cloudhal import` (dry runs included), `--replace` and `--revert`. A bundle that defines either type is still refused whole where the capability does not hold, and a site's new snapshot cannot point at another site's held site body to bring the types in.
  - **MCP and Studio.** `update_collection` and `change_field_type` list both types, and `/api/instance` answers `features.referenceFields: true`, on servers that have the capability. The store still decides per site.
  - **A one-time `entry_refs` check per site** (`rebuildEntryRefs`, new core-ts export): the admin Worker's new `refs.rebuild` system job (every five minutes, offset from `lists.backfill`, until every site is done; then two reads a run), and `openLocalStore` at start-up. Rows are written per entry, anchored on the hash each entry was read with, so a concurrent edit keeps its own rows; each chunk is anchored on the site node's hash, so no statement grows with the site's settings; it leaves a site alone while a text ↔ reference type change runs there; progress is in the new `entry_refs_state` table (storage migration `0034_entry_refs_state`), so a run stopped anywhere resumes. It is a safety net and should find nothing to change.
- Updated dependencies [74d7098]
  - @cloudhal/core-ts@0.9.1
  - @cloudhal/storage@0.9.1
  - @cloudhal/mcp-server@0.9.1
  - @cloudhal/astro-renderer@0.9.1
  - @cloudhal/comments@0.9.1
  - @cloudhal/agent-runtime@0.9.1
  - @cloudhal/analytics@0.9.1
  - @cloudhal/schedules@0.9.1
  - @cloudhal/core-contracts@0.9.1

## 0.9.0

### Patch Changes

- bb43a16: RFC-0045 rollout step 4: the four field operations work on reference and repeater fields. The types themselves stay refused on every production write path until step 7 (`fields_unsupported`, now from the dry run's check of the definitions the operation ends with); the shared suites enable them with `SiteGraphStoreOptions.fieldTypes`. Nothing changes for operations on the nine existing types.
  
  - **`sub`** on all four operations (`FieldOperation.sub`, `FieldMigration.sub`): with it, `rename_field`, `change_field_type` and `remove_field` rename, convert or remove one sub-field of a repeater in every item. An item left empty is dropped, and a list left empty is no value. `set_field_localized` refuses `sub` (sub-fields share their repeater's `localized`). Readers, writers and the rows read items through the marker; a top-level reader ignores a sub-field rename's `fromKey` (`renamedFrom`).
  - **New `change_field_type` inputs:** `collections`, `maxItems`, `subFields` and `itemLabel`, each refused where the target type does not take it. A reference changes to a reference only to switch `multiple`. A conversion that carries ids over may only widen the target collections. A repeater converts to text or to a reference only with exactly one matching sub-field.
  - **New conversion rows** (`fields/conversions-references.ts`): reference single ↔ multiple, text ↔ reference (through the prefetched `ConvertContext.entries` maps, never the entry's own group), multiline text → repeater, repeater → text, and multiple reference ↔ repeater. The maps are read once per operation pass, and by `EntryEngine.write` while such a conversion runs.
  - **Text ↔ reference values** are decided by one rule (`fields/text-reference.ts`), per value, from the `entry_refs` rows that phase C's pending check reads too: each operation pass loads the path's rows once, and a person's write reads its node's. A value with its row is kept; a legacy id-shaped text is written as a reference when its group is usable, else reported; a value that does not convert keeps its rows as they are. Readers use a display rule. Rebuilds (pull, push, import, restore) read a converting path through its earlier type. The renderer's conversion maps read archived entries too, so an archived target lends its title.
  - **Phase B's target guard** covers only the ids a rewrite newly names; ids a reshape or a rename carries over stay as stored, rows kept. **`set_field_localized`** updates the rows' `shared` in the batch of its site write (phase A, and the revert's).
  - **Revert** drops restored references whose group has no member left in the site, and reports them in `FieldRevertResult.dropped`.
  - **Values that stop converting while an operation runs** (a target archived or deleted, a second entry with the same title) are reported in `unconvertible` and keep the operation running. `continueFieldOperation` and `revertFieldOperation` take `onInvalid: "clear"` to drop them, as do the admin API's continue and revert routes (in the body) and `cloudhal fields continue|revert --clear`.
  - **Releases (#213):** when the read of the published site node fails, the run retries it once, then purges everything; it no longer falls back to the working site row.
  - **`multiple`** on a type change to a type that has none is ignored, as before.
  - **CLI:** `cloudhal fields retype` takes `--collections a,b`, `--max-items n` and `--sub-fields <file.json>`, and every action takes `--sub <sub-field>`. The admin API's operation route parses the same inputs. MCP's operation tools take them with rollout step 5.
- dda55ee: RFC-0045 rollout step 5: reference and repeater fields over MCP. The two types stay refused on every production write path until step 7 (`fields_unsupported`), and the field inputs do not list them there; a store with `SiteGraphStoreOptions.fieldTypes` gets tools that do. Nothing changes for the nine existing types, except as listed.
  
  - **`list_collections`** returns, beside `fieldsSchema`, its strict profile `fieldsSchemaStrict` (every key required, `null` for "leave as it is") and `strictCost` (`properties`, `depth`, `enumValues`, `unions`). Reference targets are named by their collections' labels.
  - **`create_entry` / `update_entry`** take `fieldsStrict`, for strict structured output, instead of `fields` (`invalid` when both are given): `null` or a missing key leaves a value as it is (on create, no value); `null` sub-values in repeater items are stripped, and items left empty are dropped and reported in `droppedItems`. `update_entry` also takes `clearFields` (set and clear of one key is `invalid`, an unknown key `unknown_field`); on create it is `invalid`. A given reference or repeater value replaces the whole value.
  - **Prechecks are the store's own write plan**, run as a dry run: the new `NodeWriteOptions.dryRun` on `createContentEntry`/`updateContentEntry`, and `deleteContentEntry(entry, { dryRun })`, throw the plan-time refusals (values, links, references, a release hold, gates, assets, terms) and write nothing. So `create_entry` and `update_entry` refuse reference targets (`unknown_entry`), repeater items and the references cap before anyone is asked, and `delete_entry` refuses `entry_referenced` with the published referrers. Behaviour change: those prechecks now also run the store's translation-link and canonical-id checks, which the handler ran anyway.
  - **Approval prompts** name targets readably, from the dry run's planned entry (canonical ids): `venue → "Main hall" (entry_…, Places)`, `speakers: 2 items → 3 items (added "Ada Lovelace", Speaker; changed item 1: person → "Grace Hopper" (entry_…, People))`, quoted and truncated.
  - **New read-only tool `list_references`** (`content:read`) with `direction: "to"` (referrers, published first, with the members that show them) or `"from"` (the groups an entry names, its original's inherited ones included). 110 → 111 tools. The API's `GET …/entries/:entryId/references` and the tool share core-ts's new `listReferrers` (and `listReferenceTargets`, `referenceCard`).
  - **`list_entries`** returns each entry's `groupId`, the value a reference stores.
  - **Translation tools**: `get_translation_source` lists a localized repeater's text and rich-text sub-values by item path (`speakers/0/talk`) with the source's `sourceRev`; `save_translation` takes them back with that `sourceRev` (`conflict` when the source changed) and folds them into a copy of the source's list, keeping each item's other sub-values (core-ts `translatedItemValues`). Once the translation holds its own list for that repeater, item paths are refused and the list is sent whole; a whole list given together with item paths must have the source's length (`translation_shape_mismatch`, new code, 409 in the API). A path naming no such value is refused. Keys whose first part is not a repeater (`og/image`) stay plain keys.
  - **`normalizeEntryFields`** is exported from `@cloudhal/core-ts`: MCP's approval prompts read stored values through the markers exactly as the store does.
  - **`continueFieldOperation`** with `onInvalid: "clear"` reports the values it drops as cleared, without the stored request's `field_values_unconvertible` refusal.
  - **Removals during `rename_field`** over MCP: the old and the new key are one field; removing either removes both, so the writer's move cannot bring the value back, and setting one while removing the other is `invalid`.
  - **Operation tools** take step 4's inputs: `sub` (`rename_field`, `change_field_type`, `remove_field`), `collections`, `maxItems`, `subFields` and `itemLabel` on `change_field_type`, and `onInvalid: "clear"` on a continuation; results carry `unconvertible`.
  - **`defineTools({ referenceTypes })`** and `defaultToolList(referenceTypes)`: `createCloudhalMcpServer` passes whether its store has `fieldTypes`.
- 3678855: RFC-0045 rollout step 6a: reference and repeater fields in Studio's entry editor. The two types stay refused on every production write path until step 7 (`fields_unsupported`), so no production collection can define them yet and Studio looks unchanged there.
  
  - **New read-only route `GET /api/sites/:siteId/entries/groups?ids=a,b`** (`content:read`, in the playground's allow-list): each translation group's members in the site, any status, as `{groupId, id, title, collection, status, locale}` cards (core-ts `getGroupMembers` and `referenceCard`); a group with no member left answers `[]`. One to 100 well-formed group ids (the per-entry reference cap), 400 otherwise, 404 for an unknown site. Studio reads the chosen targets' titles and states through it.
  - **`fieldLabel`, `fieldHelp` and `optionLabel`** (`@cloudhal/core-ts/fields`) also take a repeater's sub-field definitions.
  - **Studio** (not published): the entry editor's reference fields (`ReferenceList` and `EntryPicker` over `GET …/entries/pick`), repeaters (`RepeaterField`, focus after add and remove, an undo toast, item errors by path), and a "Used by" card from `GET …/entries/:id/references`, with the new `@cloudhal/ui` blocks `FieldControl`, `RepeaterField`, `ReferenceList`, `EntryPicker` and `UsedByList`. They load with the lazy fields chunk; the initial bundle is unchanged.
- b7ac2e9: RFC-0045 rollout step 6b: Studio's fields builder, delete dialog and publish warnings for reference and repeater fields. Both types stay refused on every production write path until step 7, and the builder offers them only where the server takes them, so production Studio is unchanged.
  
  - **`/api/instance`** reports `features.referenceFields`: true when the store accepts reference and repeater fields (`SiteGraphStoreOptions.fieldTypes`, MCP's rule).
  - **`DELETE /api/sites/:siteId/entries/:entryId?rev=&dryRun=1`** runs the store's delete plan and writes nothing: `{ dryRun: true }`, or the plan's refusal (`entry_referenced` with its referrers, `field_operation_running`, …).
  - **New read-only route `GET /api/sites/:siteId/entries/reference-issues`** (`content:read`, in the playground's allow-list): `referenceIssues` over the working copy, the first 50 with each holder's title, and the total.
  - **Studio** (not published): reference and list fields in the builder (target collections, "Several", the maximum and conditions; item fields with up/down and ⋯, the maximum and the item name), sub-field operations and reference/list targets in "Change type…", a cleared finish for a run stuck on values that stopped converting, the delete dialog's reference rules (off while published entries show the last entry, drafts that will show nothing, the language that loses the card), publish warnings, and worded API errors for the RFC-0045 refusals.
- Updated dependencies [3b8e846]
- Updated dependencies [41d783a]
- Updated dependencies [9aa67d3]
- Updated dependencies [bb43a16]
- Updated dependencies [dda55ee]
- Updated dependencies [3678855]
- Updated dependencies [4a5633d]
  - @cloudhal/core-contracts@0.9.0
  - @cloudhal/astro-renderer@0.9.0
  - @cloudhal/core-ts@0.9.0
  - @cloudhal/mcp-server@0.9.0
  - @cloudhal/agent-runtime@0.9.0
  - @cloudhal/analytics@0.9.0
  - @cloudhal/comments@0.9.0
  - @cloudhal/schedules@0.9.0
  - @cloudhal/storage@0.9.0

## 0.8.0

### Minor Changes

- dc519c0: The consumers of reference fields (RFC-0045 §2, rollout step 2b, #114). Both new field types stay refused on every write path in production, so none of this is reachable before rollout step 7. The shared suites run it through `SiteGraphStoreOptions.fieldTypes`.
  
  - **Assets inside repeater items.** `fieldAssetRefs` walks items and records `fields.<key>.<sub>` with each use's item path. `fieldAssetIssues` checks sub-field types (a PDF in an image sub-field is refused) and reports at every item that uses the file. Skips match issue paths by prefix, in the store and in the MCP precheck alike, so top-level behaviour is unchanged.
  - **Field-operation rewrites** write their entries' `entry_refs` rows. A rewrite that changes a reference value is guarded on its target, and every rewrite in a site with reference fields is guarded on the collection's definitions.
  - **Releases** no longer treat reference values as dependencies, so a referenced entry is neither locked nor required live.
  - **Language editions** (`forEdition`) keep only what the edition's own write accepts. A reference needs a member of its group in an allowed collection that meets the field's `where`. A single-target field keeps one id, and a multiple field keeps at most `maxItems`. An entry holds at most 100 references, and a repeater at most `maxItems` items. Values are read through a running rename's old key. Everything not carried, including repeater items left empty, is reported with its reason through `onDropped`. A re-save keeps the values the edition entry already holds, as its own write would.
  - **CLI.** `cloudhal import --dry-run` warns about references that will show nothing, and about originals relinked into another group.
  - **Cloudflare.** `siteFieldTypeSupport` reads the site Worker's `fields` feature. `FIELDS_FEATURE_VERSION` and `FIELDS_SUPPORTED` are exported from `@cloudhal/core-ts/fields`. Nothing passes them to a store before step 7.
  - **API.** `GET /sites/:siteId/entries/pick` is the entry picker. Its search folds case and diacritics on both sides with `foldName`, Turkish İ and ı included, and reads at most 1,000 entries per request. When that runs out before 20 matches, it answers `truncated: true` with a `cursor` to continue from. `GET /sites/:siteId/entries/:entryId/references` lists an entry's referrers, each with the language versions that show it. Both need `content:read`.

### Patch Changes

- b6cf70f: The contract gains two field types for collections, `reference` and `repeater` (RFC-0045 §1, rollout step 1, #114). Every write path still refuses them, so existing sites behave exactly as before.
  
  - **Contract.** `FieldDefinition` gains `ReferenceField` and `RepeaterField`. A new `SubFieldDefinition` union holds a repeater's sub-fields: scalar values only, so a repeater cannot contain a repeater. `FieldMigration.fromType` gains both types, and `FieldMigration` gains an optional `sub`. There is no `schemaVersion` bump, and existing documents stay valid.
  - **The gate.** Until rollout step 7 enables them, a reference or repeater definition, or a migration marker that names one, is refused with `fields_unsupported`: API status 409, with an MCP hint. The refusal covers:
    - site creates and updates, so Studio, MCP and the API;
    - field operations;
    - every bundle `importSite` takes: import, pull, push, `cloudhal import --replace` and `--revert`, snapshot restores and edition copies.
  
    `checkBundle` gained `assertFieldTypes`. It checks the working site row, and `prepareImport` checks every snapshot site body the import writes once it has been verified (bodies the target already holds are its own), and refuses the types when no capability is given. A push answers `409 fields_unsupported` with its issues, not `400 bad_request`.
  - **Pure core** (`@cloudhal/core-ts/fields`), with no effect on stored data yet:
    - the definition rules: `reference_target_unknown`, `where`, `itemLabel`, and caps on sub-fields and leaves;
    - value checks for both types, the per-item `requiredToPublish`, and `too_many_references`;
    - `resolveFields` skips types it does not know;
    - `fieldsJsonSchema(…, { strict: true })` and `strictSchemaCost`;
    - `pickMember`, `referenceIssues`, and `FIELD_QUERY_OPS` and structured-data entries that make neither type listable or mappable.
  
    `FIELD_TYPES` keeps the nine enabled types (`EnabledFieldType`). `ALL_FIELD_TYPES` lists all eleven.
  - **MCP.** `update_collection`'s input now builds its `$defs` with `defsClosure` and offers only the enabled types. A test checks that every `$ref` in every tool's input and output schema resolves. Before this change, `pnpm gen` alone would have left the input pointing at `$defs` it did not carry.
  - **Fix, existing sites:** block props and typed-field objects no longer accept keys named after `Object.prototype` members (`constructor`, `toString`, `__proto__`, …) as known props. The props interpreter (`validateProps`) now checks and reads own keys only. Such keys are refused as unknown, and a prop the value leaves out is absent, not the prototype's function. `toLocaleString`, `isPrototypeOf` and `propertyIsEnumerable` join the reserved field keys, beside `toString`, `valueOf` and `hasOwnProperty`.
- d107895: Reference fields get their index and integrity rules (RFC-0045 §2, rollout step 2a, #114). Both new field types stay refused on every write path in production, so no reference value can exist yet; the store and the shared suites run them through `SiteGraphStoreOptions.fieldTypes` and `CopySiteOptions.fieldTypes`.
  
  - **Storage.** Migration `0033_entry_refs` adds `entry_refs`, one row per stored reference value, removed with its site.
  - **Store.** Entry writes keep the rows in their own batch and check their targets at batch time (`unknown_entry`, `reference_target_moved`). Deletes, moves and group changes are refused while a published entry shows a reference to the group's last usable member (`entry_referenced`, `reference_target_moved`, `field_operation_running`). Imports rebuild the rows beside a written node set. Field operations naming a reference or repeater field answer `field_operation_unsupported`. Definition changes that would strand values are refused (`field_key_in_use`, removed target collections or sub-fields, `multiple`).
  - **API and MCP.** The new refusals answer 409 or 422, with MCP hints.
  
  **Behaviour changes on existing sites** (RFC-0045 decision 3):
  
  - relinking a node that other nodes use as their translation group is refused (`translation_group_in_use`, 409);
  - `resolveFields` and the store read an original's non-localized values only when the original's own group is its id: a node relinked into another group lends them to nobody (OQ 14). The list-values fingerprint format moves to 2, so every listed collection's `entry_list_values` rebuild once (`lists.backfill`); listings scan until they are ready;
  - a change of `translation.group` alone gets the same source-group check as a source change, and a write joining a group checks that its node is still that group's original;
  - imports store node bodies in canonical form (the hash is unchanged);
  - deletes, moves and group changes of entries carry the collections anchor, and entry writes that change `fields` or `collection` carry the definitions anchor: a concurrent change of the collections' settings makes them answer 409, and a retry succeeds. The anchors compare the stored text read when the write is planned, so site rows stored with any key order work;
  - field operations that would turn a field into a reference or repeater answer `field_operation_unsupported` (409) instead of `fields_unsupported`.
- Updated dependencies [dc519c0]
- Updated dependencies [b6cf70f]
- Updated dependencies [d107895]
  - @cloudhal/core-ts@0.8.0
  - @cloudhal/mcp-server@0.8.0
  - @cloudhal/core-contracts@0.8.0
  - @cloudhal/storage@0.8.0
  - @cloudhal/astro-renderer@0.8.0
  - @cloudhal/comments@0.8.0
  - @cloudhal/agent-runtime@0.8.0
  - @cloudhal/analytics@0.8.0
  - @cloudhal/schedules@0.8.0

## 0.7.3

### Patch Changes

- Updated dependencies [5cb0a5d]
- Updated dependencies [403043b]
  - @cloudhal/core-ts@0.7.3
  - @cloudhal/astro-renderer@0.7.3
  - @cloudhal/comments@0.7.3
  - @cloudhal/mcp-server@0.7.3
  - @cloudhal/agent-runtime@0.7.3
  - @cloudhal/analytics@0.7.3
  - @cloudhal/core-contracts@0.7.3
  - @cloudhal/schedules@0.7.3
  - @cloudhal/storage@0.7.3

## 0.7.2

### Patch Changes

- 060a9c8: A self-hosted site rebuilds itself on publish (#150). With `CLOUDHAL_SITE_BUILD=on`, which is the Docker image's default, `cloudhal studio` runs the image's `site-build` in a child process after every publish: a publish in Studio or through MCP, an approval, a rollback, or a release that goes live (at its time or through "Publish now"). It also runs it once at start.
  
  - **One build per burst.** A burst of publishes builds once (3 seconds after the last one, at most a minute after the first).
  - **One build at a time.** Studio's builds, a cron `site-build` and a hand-started one share one lock.
  - **Failures keep the last good site.** A failed build keeps the previous site and is tried again on the next publish.
  - **Bounded.** A build has a deadline (`CLOUDHAL_SITE_BUILD_TIMEOUT`, 30 minutes by default). Stopping Studio during a build ends it within 5 seconds, with everything it started, and records it as stopped.
  
  Every build is recorded in the site's Activity as "Build public site", with its duration, snapshot and output on failure. The site's overview shows a new "Public site build" card with the same details, and what visitors see now from `/data/site/current.json`, which `site-build` writes after each swap, so builds from cron or by hand show there too. The failure's output is shown only to roles with `audit:read`. `CLOUDHAL_SITE_BUILD=off` turns both off for sites built elsewhere, and a plain `cloudhal studio` keeps it off. For other integrations, `ScheduledTickOptions.onReleasePublished` (core-ts) reports releases that went live, `ReleaseServiceOptions.onReleasePublished` (and the API's `SchedulesDeps.onReleasePublished`) reports a release published now, `openLocalStore` takes `onPublished`, and `GET /api/sites/:id/site-build` reports the queue, the last build and what is served.
- Updated dependencies [6de8d67]
- Updated dependencies [060a9c8]
  - @cloudhal/astro-renderer@0.7.2
  - @cloudhal/core-ts@0.7.2
  - @cloudhal/mcp-server@0.7.2
  - @cloudhal/comments@0.7.2
  - @cloudhal/agent-runtime@0.7.2
  - @cloudhal/analytics@0.7.2
  - @cloudhal/core-contracts@0.7.2
  - @cloudhal/schedules@0.7.2
  - @cloudhal/storage@0.7.2

## 0.7.1

### Patch Changes

- 24fe76b: Security fixes from the CodeQL backlog on `main`.
  
  - **Prototype pollution.** A2UI `updateDataModel` paths (`@cloudhal/core-ts/interop`) that name `__proto__`, `constructor` or `prototype` at any depth are now refused with an `InteropError` instead of being skipped, step into arrays by index only, and write own properties only; an input whose component id is one of those keys gets the data key `<id>-value`. Surface pointers the page writes through (an input's `value`/`checked`, a Scrolly's `step`, a Button action's `path`) may not name those keys (a `checkSurface` issue); read bindings still may. The Build eval's sample inputs never write through them, and `set_chrome` and `update_entry`'s `fields` merge patch refuse them as keys. `RESERVED_KEYS` and `isReservedKey` are new in `@cloudhal/core-ts/names`.
  - **Plain text from HTML.** `htmlText` (meta and feed descriptions, JSON-LD, table-of-contents labels) is plain text: `&lt;script&gt;` in markdown is the text `<script>`, as before, and every place it goes escapes it (now tested sink by sink). Tags are dropped with a linear scan, and entities are decoded once (`&amp;#60;` is the text `&#60;`, no longer `<`).
  - **Linear scans (AGENTS.md rule 13).** The svg sniff of uploads (exponential on `<!--` followed by many `--><!--`), the code-fence opener of surface bodies, the rich-text-to-text and text-to-rich-text field conversions, hostname normalization, the leading-H1 check of articles, the table of contents, the `::embed` check, the sender-address check (`isMailAddress`, new in `@cloudhal/api`; `MAIL_ADDRESS` in `@cloudhal/cloudflare/mail` is deprecated) and Studio's origin trim no longer backtrack. Each gives the old regex's answers; one intended difference: an svg comment ends at its first `-->`.
- Updated dependencies [24fe76b]
  - @cloudhal/core-ts@0.7.1
  - @cloudhal/astro-renderer@0.7.1
  - @cloudhal/mcp-server@0.7.1
  - @cloudhal/comments@0.7.1
  - @cloudhal/agent-runtime@0.7.1
  - @cloudhal/analytics@0.7.1
  - @cloudhal/core-contracts@0.7.1
  - @cloudhal/schedules@0.7.1
  - @cloudhal/storage@0.7.1

## 0.7.0

### Minor Changes

- 6057871: Remote MCP clients can now authorize with OAuth 2.1 against the deployment itself (RFC-0044 Phase 2, ADR-0045). Better Auth's `mcp()` and `jwt()` plugins run in the Studio's auth instance when the runtime has a stable public origin: the admin Worker uses its origin, `cloudhal studio` needs `--base-url` / `CLOUDHAL_BASE_URL` (it logs why OAuth is off otherwise), and `CLOUDHAL_MCP_OAUTH=off` turns it off. Access tokens are Ed25519 JWTs bound to `/mcp` for one hour, refresh tokens rotate with a 30-second reuse window, and each connection is approved on Studio's new consent screen (`/oauth/consent`), which narrows the requested scopes by the member's role and records an `agent_grants` row (migration `0031_oauth`). A token resolves to the same principal an agent key does; revoking a connection (`DELETE /api/agent-grants/:id`) or removing the member refuses it on its next call. The Better Auth family moves to 1.7.18. Client registration (CIMD, DCR) and the "Connected agents" screen follow in Phase 3.

### Patch Changes

- d363160: Remote MCP clients can now register themselves (RFC-0044 Phase 3a, ADR-0045). Clients that name an HTTPS Client ID Metadata Document as their `client_id` (Claude Code, Codex, VS Code) are accepted through `@better-auth/cimd`, fetched with the media import's SSRF-safe transport (pinned on Node, DoH-checked on Workers; https only, public addresses only, no redirects, 5 KB, 5 s). Clients without one (Cursor) use dynamic client registration at `/api/auth/oauth2/register`: public clients only, rate-limited per address and per day, capped at 5,000, and pruned by the scheduler after 30 unused days. Document clients are fetched at most hourly per client, with budgets in Cloudhal's own counters that never lock out stored clients, a cap of 5,000 that evicts unused clients (the well-known clients' hosts are exempt), pruning after three hours unused, and a failed refetch that refuses the client; migration `0032_oauth_client_kind_index` indexes them. Redirect URIs must be https, loopback http (any port) or a native app's private-use scheme (`cursor`, `vscode`, reverse-domain, `CLOUDHAL_MCP_REDIRECT_SCHEMES`), and the client host list applies at every authorization. With DCR off, the clients it registered earlier cannot start new authorizations. The consent screen shows client names plain and short, a document client's host first, and marks self-registered clients as unverified. `CLOUDHAL_MCP_CIMD=off`, `CLOUDHAL_MCP_DCR=off`, `CLOUDHAL_MCP_CLIENT_HOSTS` and `CLOUDHAL_MCP_REDIRECT_SCHEMES` control it on both runtimes, and the Docker compose file passes them through. The Phase 2 server-side test client (`OauthServer.createClient`) is removed. `set_embargo` through an OAuth connection now files the gate for a person's approval instead of leaving it unapplied, and the request is notified while it waits. `safeFetch` results carry the response headers.
- e6fe6eb: Studio shows "Connected agents" and how to connect an MCP client by URL (RFC-0044 Phase 3b). On `/agents`, each member sees the apps they connected through OAuth. A client is named as the consent screen named it: a metadata document's host first, a self-registered client as not verified, a name that looks like a well-known client with a warning. Each row shows what the connection can do in words, its mode and when it was last used, and has Disconnect, which uses the existing revoke. Administrators see every member's connections under **All keys**. "Connect an MCP client" gains a **Connect by URL** tab: the deployment's `/mcp` URL, steps for Claude, Claude Code, ChatGPT and Codex, Cursor, VS Code and the MCP Inspector, and a note where a client needs dynamic client registration that is off.
  
  `GET /api/agent-grants` now returns `client` (`kind`, a document client's `host`, `lookalike`) with the name sanitized, and with `?all=1` each owner's `role`. `/api/instance` reports `features.mcpOauthClients`: the `/mcp` resource, and whether metadata documents and dynamic registration are on. The new guide is `docs/guides/mcp-oauth.md`, and the MCP server README has an Authentication section.
- Updated dependencies [6057871]
- Updated dependencies [d363160]
- Updated dependencies [e6fe6eb]
  - @cloudhal/storage@0.7.0
  - @cloudhal/mcp-server@0.7.0
  - @cloudhal/core-ts@0.7.0
  - @cloudhal/agent-runtime@0.7.0
  - @cloudhal/analytics@0.7.0
  - @cloudhal/astro-renderer@0.7.0
  - @cloudhal/comments@0.7.0
  - @cloudhal/schedules@0.7.0
  - @cloudhal/core-contracts@0.7.0

## 0.6.5

### Patch Changes

- b0ebd95: MCP OAuth step-up follow-ups (RFC-0044 phase 1, #168). These stay latent until phase 2 gives connections a `grantId`. A policy denial for missing scopes now carries `missing`, the required scopes that neither the caller's scopes nor an own variant satisfy. The new `stepUpScopes(policy, principal, tool, args)` turns that into the scopes a token should ask for, using the same rules as the handler: a propose call's `proposeScopes`, the own variant the member's role holds (`content:write:own` for an Author, `content:draft:own` for a Contributor, `site:publish:own` for an Author's publish) and the member's role on the call's site (RFC-0034 A2), capped by their installation role as consent caps a token (an installation Contributor who is an Editor on one site is asked for `content:draft:own` there). A call that would still be denied with those scopes, such as a write in plan mode or a tool outside the declared skill, is not challenged. The `/mcp` step-up 403 asks for exactly that set and now leaves an audit row, like other denials. `createApi` throws when `mcp.oauth.resource` is not the public URL of `/mcp`. A playground refuses both OAuth protected-resource documents (`403 {error: "playground", block: "mcp"}`), as its route table already said.
- b0ebd95: Cloudhal's own rate-limit counters move out of Better Auth's `rateLimit` table into `rate_limits` (migration `0030_rate_limits`, #168). This covers the hourly cap of 3 reset mails per address, the per-minute buckets of the public token endpoints and each agent key's window. Better Auth prunes `rateLimit` by its own 60 s window, so the hourly reset-mail cap used to restart about a minute after any sign-in from the same address. Each hit counts in one statement (an upsert with `RETURNING`). Because the keys come from client addresses and submitted email addresses, about one hit in 32 also deletes up to 500 expired counters through an `expires_at` index. The migration deletes the old `cloudhal:` rows from `rateLimit`, so each counter starts over once at upgrade.
- c15218e: Second ReDoS sweep (#174). Input that made a regex backtrack is now handled in linear time; results are unchanged.
  
  - **Unauthenticated password-reset request.** `POST /api/password-reset/request` (and invite creation) checks the address length before anything else, and the address check no longer backtracks: `a@` followed by many dots used to cost seconds of CPU per request. Public token endpoints (`/api/password-reset/*`, invite acceptance) refuse a JSON body over 64 KiB with `413 payload_too_large`, whether or not it declares a `content-length`.
  - **core-ts.** Redirect path normalising and matching (on every site request): `normalisePath`, `joinTarget`, and `ancestorPaths`, which no longer lists ancestors that no redirect can match: those longer than a `from` may be (1024 code points) or holding `//`. Directive lines in search text keep their braces on one line, so a directive whose `{…}` spans a lone `\r` is no longer read as one. Search text built at publish time: fenced code, links, images and tags. SVG upload checks: CSS comments, `url(…)` references (about cubic on `url(` followed by spaces) and width/height lengths (new `css-scan.ts`).
  - **schedules.** The feed check's CDATA, element and `<enclosure>`/`<media:content>` url scans, and `urlPath`.
  - **agent-runtime.** SKILL.md frontmatter lines (a line of spaces was quadratic).
  - **Studio** (in `@cloudhal/cli`): the markdown body editor's trailing-newline trims.
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [b0ebd95]
- Updated dependencies [c15218e]
- Updated dependencies [f4a1ee3]
  - @cloudhal/core-ts@0.6.5
  - @cloudhal/analytics@0.6.5
  - @cloudhal/astro-renderer@0.6.5
  - @cloudhal/comments@0.6.5
  - @cloudhal/agent-runtime@0.6.5
  - @cloudhal/storage@0.6.5
  - @cloudhal/schedules@0.6.5
  - @cloudhal/mcp-server@0.6.5
  - @cloudhal/core-contracts@0.6.5

## 0.6.4

### Patch Changes

- 471087a: **Security (self-hosting, #165).** In 0.6.3 a self-hosted `cloudhal studio` (the Docker image included) exposed to a network before its first sign-up could be claimed by whoever reached it first: the first account to sign up became the Owner, and nothing on the Node path asked for the setup token the Cloudflare deployment already requires. If you run 0.6.3 beyond `localhost`, upgrade and check that the Owner account is yours. In 0.6.4:
  
  - **A setup token for the first account.** While nobody has an account, `cloudhal studio` requires the one-time token from `CLOUDHAL_SETUP_TOKEN` (32 characters or more, letters, digits and `- . _ ~` only, e.g. `openssl rand -hex 32`; a shorter or other value stops the start) or, when that is unset, one it generates at start and prints as a `…/login#setup=<token>` link to its output (read it from the container's logs: `docker compose logs cloudhal`). Sign-up without the token is refused; once the Owner exists the link is no longer printed. An operator's own token is never printed.
  - **Sign-in from the address browsers actually use.** With `--host` beyond loopback and no `--base-url`, Better Auth refused every sign-up, sign-in and sign-out with `403 INVALID_ORIGIN` because only `http://localhost:<port>` was trusted. Without a public origin Studio now also trusts the origin each request was made to, as the API's own CSRF check does (on a loopback `--host` only when that origin is `localhost`, `127.0.0.1` or `[::1]`, so a DNS name rebound to the machine is not trusted); with `--base-url` set, that origin alone (plus `CLOUDHAL_TRUSTED_ORIGINS`) may sign in. `--base-url` is the origin browsers open Studio at: required behind a reverse proxy and recommended whenever `--host` is not loopback; a start without it beyond loopback prints a one-line warning.
  - **`--no-auth` stays on this machine.** It is refused unless `--host` is loopback (`127.0.0.1`, the default, or `::1`) and `--behind-proxy` is off.
  - **Rate limits count the real client.** The public token endpoints (invites, password resets) and Better Auth's own limits keyed on `X-Forwarded-For` / `CF-Connecting-IP` as the client sent them. `serveNode` now derives the client's address itself: the socket's, or with `trustProxy` the last `X-Forwarded-For` hop, which the proxy appended; the API (`ApiDeps.clientAddressHeader`) and Better Auth (`AuthOptions.clientAddressHeader`) read only that value on Node, while Workers keep `CF-Connecting-IP`. Sessions record that address too, and Better Auth's own limits (sign-in and sign-up: 3 per 10 s per address) now apply on Node as on Workers, stored in the project's SQLite; before they were on only under `NODE_ENV=production`.
  - Behind a trusted proxy, `forwardedUrl` takes the last value of `X-Forwarded-Proto` / `X-Forwarded-Host`, the one the proxy added, not the first, which a client can send.
  - `--base-url` is also the origin of invite and password-reset links (`ApiDeps.studioOrigin`).
  - Studio's setup banner no longer names only `cloudhal deploy`: it speaks of the setup link printed when Cloudhal started or was deployed (other languages are AI drafts awaiting review).
  - Studio's login page reads `#setup=<token>` without form decoding, so an operator's own token containing `+` (from `openssl rand -base64`, for a Cloudflare deployment too) is no longer turned into a space and refused.
  - **`--behind-proxy` needs `--base-url`.** `cloudhal studio` refuses to start with `--behind-proxy` / `CLOUDHAL_BEHIND_PROXY=1` and no `--base-url` / `CLOUDHAL_BASE_URL`. Behind a proxy the public origin is known, and as Better Auth's base URL it makes session cookies `Secure` (`__Secure-` prefix) on https and is the one origin sign-in accepts. In 0.6.3 that combination could not sign in at all, so no working setup breaks.
  - `--init-if-empty` stages the scaffold in `.cloudhal-init` inside the folder and moves it into place with `cloudhal.json` last, so a container stopped during its first start no longer crash-loops on "is not empty": the next start redoes the scaffold when the staged `cloudhal.json` is missing, cut off or names no site, and finishes it otherwise. A fresh ext4 volume whose only entry is `lost+found` counts as empty.
  - A bare `--host` means `0.0.0.0`, every IPv4 address; pass `--host ::` for IPv6 as well. The help says so.
  
  New in `@cloudhal/api`: `CLIENT_ADDRESS_HEADER`, `clientAddress` and `inboundRequest` in `@cloudhal/api/node`; `trustedOriginsWithOwn` (with `loopbackOnly`) and `AuthOptions.trustedOrigins` as a function in `@cloudhal/api/auth`; `createAuthFor` takes `setupToken`, `trustRequestOrigin` and `originCheck`. `studio()` returns `setup` (the link, while nobody has an account) and `warnings`.
- Updated dependencies [b073595]
  - @cloudhal/astro-renderer@0.6.4
  - @cloudhal/mcp-server@0.6.4
  - @cloudhal/agent-runtime@0.6.4
  - @cloudhal/analytics@0.6.4
  - @cloudhal/comments@0.6.4
  - @cloudhal/core-contracts@0.6.4
  - @cloudhal/core-ts@0.6.4
  - @cloudhal/schedules@0.6.4
  - @cloudhal/storage@0.6.4

## 0.6.3

### Patch Changes

- bf20e64: MCP OAuth discovery (RFC-0044 §1, phase 1 of #144): with `mcp.oauth` set, the 401 of `/mcp` carries a `WWW-Authenticate` challenge naming the RFC 9728 protected resource metadata and the scopes to request, the metadata is served at both well-known forms, and a token principal calling a tool without a scope its member's role holds gets a `403 insufficient_scope` step-up challenge. Deployments do not set the option yet: the authorization server is phase 2.
- 28e9406: Self-hosting (#143): `cloudhal studio` can be reached from beyond the machine it runs on. `--host <addr>` (or `CLOUDHAL_HOST`) is the address it listens on (default `127.0.0.1`; `0.0.0.0` in a container), `--base-url <url>` (or `CLOUDHAL_BASE_URL`) the public origin behind a reverse proxy — Better Auth's `baseURL` (its session cookies are `Secure` for https), a trusted origin for the API's CSRF check, and the URL the command prints — and `--behind-proxy` (or `CLOUDHAL_BEHIND_PROXY=1`) makes the server take each request's scheme and host from the proxy's `X-Forwarded-Proto` / `X-Forwarded-Host` (`serveNode`'s new `trustProxy`, with `forwardedUrl` / `forwardedRequest` in `@cloudhal/api/node`); without the flag those headers are ignored, as before. `--init-if-empty` (or `CLOUDHAL_INIT=<starter>`, with `--starter`, `--name` / `CLOUDHAL_SITE_NAME`) creates the project the way `cloudhal init` does when the folder has no `cloudhal.json`, so a container starts on an empty volume; a folder with other files is refused, as `init` refuses it. `studio()` returns the bound `port` next to `url`. `cloudhal dev --host` now also takes an address (`--host [<addr>]`; alone it still means every interface).
- Updated dependencies [1dd79c2]
- Updated dependencies [7dddd88]
- Updated dependencies [bf20e64]
  - @cloudhal/astro-renderer@0.6.3
  - @cloudhal/agent-runtime@0.6.3
  - @cloudhal/mcp-server@0.6.3
  - @cloudhal/analytics@0.6.3
  - @cloudhal/comments@0.6.3
  - @cloudhal/core-contracts@0.6.3
  - @cloudhal/core-ts@0.6.3
  - @cloudhal/schedules@0.6.3
  - @cloudhal/storage@0.6.3

## 0.6.2

### Patch Changes

- d91ef8f: Dependency patch updates (#115). `@cloudhal/api` depends on Better Auth 1.7.12 and on exactly the versions it uses itself: `@better-auth/core` and `@better-auth/api-key` 1.7.12, `@better-auth/utils` 0.5.0 and `better-call` 1.4.4. `@cloudhal/cloudflare` asks for zod ^4.6.7 (GHSA-mrhx-c7xc-m3w5 is fixed in 4.6.6). `@cloudhal/core-ts` and `@cloudhal/astro-renderer` use marked ^18.1.1. `@cloudhal/core-ts` and `@cloudhal/schedules` use temporal-polyfill 1.0.6. `@cloudhal/astro-renderer` uses vite ^8.3.5. The Studio shipped in `@cloudhal/cli` is built with React 19.3.1, TanStack Router 1.170.46 and TanStack Query 5.104.5. marked 18.1.1 splits a few unusual markdown inputs differently: a blockquote ends before an unquoted line that follows a heading, rule or HTML block, and indented HTML blocks interrupt a paragraph. A stored body like that keeps rendering and shows virtual block ids until its next write.
- Updated dependencies [7223152]
- Updated dependencies [d91ef8f]
- Updated dependencies [970c8a1]
- Updated dependencies [f73d05a]
- Updated dependencies [f73d05a]
- Updated dependencies [6cb7945]
- Updated dependencies [f669266]
- Updated dependencies [77fa9e5]
- Updated dependencies [786a455]
- Updated dependencies [8a30e30]
  - @cloudhal/core-ts@0.6.2
  - @cloudhal/schedules@0.6.2
  - @cloudhal/astro-renderer@0.6.2
  - @cloudhal/storage@0.6.2
  - @cloudhal/mcp-server@0.6.2
  - @cloudhal/analytics@0.6.2
  - @cloudhal/comments@0.6.2
  - @cloudhal/agent-runtime@0.6.2
  - @cloudhal/core-contracts@0.6.2

## 0.6.1

### Patch Changes

- Updated dependencies [40dbfcb]
- Updated dependencies [028f396]
- Updated dependencies [92c3867]
  - @cloudhal/core-ts@0.6.1
  - @cloudhal/mcp-server@0.6.1
  - @cloudhal/astro-renderer@0.6.1
  - @cloudhal/comments@0.6.1
  - @cloudhal/agent-runtime@0.6.1
  - @cloudhal/analytics@0.6.1
  - @cloudhal/core-contracts@0.6.1
  - @cloudhal/schedules@0.6.1
  - @cloudhal/storage@0.6.1

## 0.6.0

### Minor Changes

- 90d0828: Collections stage 3 in the store and the API (RFC-0042 step 2, ADR-0044). `updateSite` checks the new collection settings when they change: `listFields` and `expiry.field` name fields of the collection (`unknown_field`), the expiry field is a date or datetime field (`invalid_expiry`), and a structured-data preset passes `checkStructuredData` (`structured_data_invalid`; warnings are not refused). Unlisting, dropping or retyping a list field, or dropping a select option, that `contentList` sections still filter or sort by is refused as `list_field_in_use` naming the pages, kept true by a guard on the site CAS. Page writes check changed `contentList` `where`/`orderBy` against the collection's list fields (`invalid_query`, with `sections/<i>/…` paths). Field operations follow: `rename_field` renames the field in `listFields`, `expiry`, structured-data sources and sections' queries in phase A's batch (and back on revert); `remove_field` refuses while any of them names the field; `change_field_type` refuses when the new type would break them. New `queryContentEntries` (and `applyFieldQuery`) filters and orders a collection's entries by list fields with the shared evaluator over resolved values. `GET /api/sites/:id/entries` takes `where` (JSON), `orderBy` (JSON), `limit` (1–100) and `cursor`; with `limit` it answers `{ entries, total, nextCursor? }`, without it the plain array as before. New error codes `invalid_query`, `structured_data_invalid`, `invalid_expiry` (422) and `list_field_in_use` (409). Sites without the new settings behave as before.
- 2e89658: Collections stage 3, step 5 (RFC-0042 §7 / ADR-0044): Studio.
  
  - **Collection settings** get three cards, each saved on its own: **Listing fields** (up to four fields, ordered; a field content lists still use names those pages), **Expiry** (a date or date-and-time field, "Leave lists" or "Hide the page" explained in words, a grace in minutes, and how many published entries are already past it; a site Worker that does not apply expiry yet says to deploy first) and **Structured data** (Event, Job posting, Product or Recipe; every property offers only the sources that fit it, required ones are marked, problems show while editing, and a chosen entry's JSON-LD is previewed with a link to Google's Rich Results Test).
  - **Create listing page** makes a draft page at the collection's address with a content list of it (upcoming first for a collection with a date listing field and an expiry) and opens it; when a page already lives there, the action opens that page.
  - **Collection lists** show listing fields as columns, filter by them and sort by number and date fields. Filters and sort live in the URL and ask the API by field, one page at a time.
  - **Page editor**: content list sections get conditions and an order by the collection's listing fields; refused conditions show on their row.
  - Words for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported`, the `preview_structured_data` tool and the expiry auto-publish check. Translations are AI drafts awaiting review.
  - `@cloudhal/api`: new read-only `GET /api/sites/:siteId/entries/:entryId/structured-data` (`content:read`), the REST twin of MCP's `preview_structured_data`: the preset document an entry's page emits, its issues and the preset's warnings.

### Patch Changes

- Updated dependencies [321e8be]
- Updated dependencies [5aced9a]
- Updated dependencies [4f3f520]
- Updated dependencies [3e93878]
- Updated dependencies [90d0828]
- Updated dependencies [84c6d94]
  - @cloudhal/core-contracts@0.6.0
  - @cloudhal/core-ts@0.6.0
  - @cloudhal/astro-renderer@0.6.0
  - @cloudhal/mcp-server@0.6.0
  - @cloudhal/agent-runtime@0.6.0
  - @cloudhal/analytics@0.6.0
  - @cloudhal/comments@0.6.0
  - @cloudhal/schedules@0.6.0
  - @cloudhal/storage@0.6.0

## 0.5.0

### Minor Changes

- cc263c3: Typed custom fields, step 3 (RFC-0041 §6 / ADR-0043): field operations.
  
  - **`runFieldOperation` / `continueFieldOperation` / `revertFieldOperation` / `fieldOperationStatus`** in `@cloudhal/core-ts` run `rename_field`, `change_field_type`, `set_field_localized` and `remove_field`: a dry run (entries touched, values moved, converted, cleared, removed, unchanged and unconvertible, per locale, with samples), a `before …` snapshot whose id is the operation id, the new definition with its `migration` marker (phase A), entries rewritten in guarded batches of 200 that resume after an interruption (phase B), the marker dropped once nothing is pending (phase C) and an `after` snapshot. Only the draft graph changes. A type change follows a closed conversion table (`convertFieldValue`, exported from `@cloudhal/core-ts/fields`) and refuses values it cannot convert (`field_values_unconvertible`) unless `onInvalid: "clear"`. One operation per collection at a time (`operation_in_progress`). Reverting restores the earlier definition and the entries nobody edited since, and converts edited ones back.
  - **Readers stay consistent mid-run:** `resolveFields` converts values still in the old type, and a field being removed reads as gone; a person's entry write during an operation goes through the marker, so edits and the operation converge.
  - **Translations:** changing only non-localized field values of an original no longer marks its translations stale (their recorded source hash follows, in the same batch); operations keep fresh translations fresh.
  - **API:** `POST /api/sites/:id/collections/:key/fields/operations` (`dryRun`, `?continue=<id>`), `GET …/:operationId`, `POST …/:operationId/revert` (`site:settings` and `content:write`), and the same under `/api/admin` with the deployment token.
  - **CLI:** `cloudhal fields rename|retype|localize|remove|continue|revert [--dry-run] [--remote]`; the dry run also lists theme files that read the field directly.
- bd5af88: Typed custom fields, step 2 (RFC-0041 / ADR-0043): the store and the API enforce field definitions.
  
  - **Site writes** (`updateSite`, `createSite`, `PUT /api/sites/:id/collections/:key`, dry run included) check definitions: reserved (`field_key_reserved`) and duplicate keys or options, `minimum` above `maximum`, 30 fields per collection and 200 per site (`too_many_fields`), 256 KB of collection settings (`too_large`). A plain edit never loses a value: changing a field's `type`, `localized` or `multiple`, or dropping a key or a select option that an entry still holds, is refused with `409 field_change_needs_operation`, naming the field operation to use. Other site writes do not re-run the checks.
  - **Entry writes** check only the field values that changed: `422 invalid_fields`, `unknown_field` (a new key without a definition, once the collection has definitions; stored unknown keys are kept), `field_not_localized` (a translation's own copy of a non-localized value) and `required_field` (review or published without a `requiredToPublish` value; drafts save freely). `fields` is capped at 256 KB per entry in every collection when it changes (`too_large`). Image values must be image assets of the site, and image and rich-text asset references are recorded in `asset_refs` under `fields.<key>`, so a used file cannot be deleted. Every refusal lists its problems with paths in `details.issues` (`fields/startsAt/at`).
  - **API inputs** remove a key with `null` in a collection that has definitions. Collections without definitions keep `fields` as any JSON, exactly as before.
  - **Search**: `text` and `richText` fields marked `searchable` add their words to the entry's search text at the next publish (off by default; sites without searchable fields index byte for byte as before).
  - `refuseFieldIssues` and `fieldRefusalCode` are exported from `@cloudhal/core-ts/fields`.

### Patch Changes

- Updated dependencies [672b993]
- Updated dependencies [9d04a37]
- Updated dependencies [cc263c3]
- Updated dependencies [92d3362]
- Updated dependencies [bd5af88]
  - @cloudhal/core-contracts@0.5.0
  - @cloudhal/core-ts@0.5.0
  - @cloudhal/mcp-server@0.5.0
  - @cloudhal/astro-renderer@0.5.0
  - @cloudhal/agent-runtime@0.5.0
  - @cloudhal/analytics@0.5.0
  - @cloudhal/comments@0.5.0
  - @cloudhal/schedules@0.5.0
  - @cloudhal/storage@0.5.0

## 0.4.0

### Minor Changes

- 3c4453e: First-class collections, step 2 (RFC-0040 / ADR-0042).
  - **Store:** the first entry of a new collection is refused (`path_conflict`, `reserved_path`) when its default prefix `/<collection>` overlaps another collection's permalink, a taxonomy archive, `/search` or a locale prefix. This closes the gap RFC-0038 left. A site update that declares a new collection runs the same check, and a declared collection that still has entries, or that a taxonomy names, cannot be undeclared (`collection_in_use`).
  - **API:** new routes under `/api/sites/:id/collections`:
    - `GET` (`content:read`) lists the registry;
    - `PUT /:key { settings, rev }` declares or changes a collection (`site:settings`), with `?dryRun=1`;
    - `DELETE /:key?rev=` undeclares an empty one.
  
    Creating an entry in a collection outside the registry is refused with `collection_undeclared` (422).
  - **Renderer:** RSS feeds leave out collections with `feed: false`, and `sitemap.xml` leaves out those with `sitemap: false`. The defaults are unchanged. `collectionLabel` and `collectionSettings` are re-exported from `./routing` for themes.
  - **MCP:** resetting a permalink with `set_collection_permalink` keeps the collection declared. Agents get hints for the new error codes.

### Patch Changes

- Updated dependencies [18a3960]
- Updated dependencies [c287a09]
- Updated dependencies [3c4453e]
  - @cloudhal/mcp-server@0.4.0
  - @cloudhal/core-contracts@0.4.0
  - @cloudhal/core-ts@0.4.0
  - @cloudhal/astro-renderer@0.4.0
  - @cloudhal/agent-runtime@0.4.0
  - @cloudhal/analytics@0.4.0
  - @cloudhal/comments@0.4.0
  - @cloudhal/schedules@0.4.0
  - @cloudhal/storage@0.4.0

## 0.3.13

### Patch Changes

- Updated dependencies [6a39c6d]
  - @cloudhal/core-ts@0.3.13
  - @cloudhal/astro-renderer@0.3.13
  - @cloudhal/comments@0.3.13
  - @cloudhal/mcp-server@0.3.13
  - @cloudhal/agent-runtime@0.3.13
  - @cloudhal/analytics@0.3.13
  - @cloudhal/core-contracts@0.3.13
  - @cloudhal/schedules@0.3.13
  - @cloudhal/storage@0.3.13

## 0.3.12

### Patch Changes

- bc096b2: Studio shows changes that are not live yet: a badge beside Publish with the count ("2 changes", or "Not published" before the first publish) and a tooltip by kind ("3 changes aren't live yet · 2 articles and 1 page"). It comes from the new `GET /api/sites/:siteId/pending` (`site:read`): counts of what a publish would add, change and remove, by kind; adding or removing a page counts once. Studio refreshes it after every write to the site, on window focus and every 30 s.
- Updated dependencies [84d1fc3]
  - @cloudhal/core-ts@0.3.12
  - @cloudhal/astro-renderer@0.3.12
  - @cloudhal/comments@0.3.12
  - @cloudhal/mcp-server@0.3.12
  - @cloudhal/agent-runtime@0.3.12
  - @cloudhal/analytics@0.3.12
  - @cloudhal/core-contracts@0.3.12
  - @cloudhal/schedules@0.3.12
  - @cloudhal/storage@0.3.12

## 0.3.11

### Patch Changes

- 25b002c: Fewer D1 round trips per admin API request. The session is cached in a signed cookie for 60 seconds, so a session revoked elsewhere can stay usable that long (ADR-0010 addendum); membership and roles still apply at once. A member and their site roles load in one query. `get-session` is no longer rate limited, since the limiter's D1 read and write landed on every session check. Due comment purges are swept at most every 10 seconds per isolate instead of on every request.
- 55deb41: RFC-0038 step 1: `Site.collections.<key>.permalink` in the contracts (a template, `/blog/{slug}`; v1 is fixed segments plus `{slug}`), and `entryPath(site, entry)` / `entryAt(site, path)` in `@cloudhal/core-ts` (also `@cloudhal/core-ts/permalinks`). Every entry URL in the renderer, starter, API, MCP server, CLI and Studio now comes from them; with no `collections` set, every URL is the same as before. The renderer's one-argument `entryPath(entry)` is replaced by core's `entryPath(site, entry)` (re-exported from `@cloudhal/astro-renderer/routing`); themes pass the site, or `MediaContext.permalinks`.
- 4cd475d: Collection permalinks, step 3 (RFC-0038 §5): Studio's Site settings has a Collections section, one row per collection with the URL prefix before `/{slug}` and a real entry's address; saving goes through the site update, which writes the permanent redirect, and a path conflict shows on the row. The new MCP tool `set_collection_permalink` (`site:write`) moves a collection's URLs and always waits for a person, in every mode, with a prompt listing the old and new template, example entries' old and new URLs and the redirect; `dryRun: true` returns that plan without changing anything, and overlaps are refused before anyone is asked. `get_site` documents `collections`. `SiteGraphStore.updateSite(site, { dryRun: true })` runs every check without writing. A menu item for a collection links to a published page at the collection's permalink prefix when there is one, before the page that lists the collection. The blog starter's README describes collection permalinks. Only someone who may change site settings (`site:settings`) approves it: tool policies take a new `approverScopes`.
- 1d7998a: Studio's images load faster and stop re-downloading. Preview URLs carry the file's hash (`?v=`), so the browser keeps them for a day; without it the content route answers `private, no-cache` and a 304 through the ETag, instead of `no-store`. While an image loads, its tile shows the image's own colour and small blurred preview (computed at upload) instead of a spinner.
- Updated dependencies [55deb41]
- Updated dependencies [2d0a257]
- Updated dependencies [4cd475d]
  - @cloudhal/core-contracts@0.3.11
  - @cloudhal/core-ts@0.3.11
  - @cloudhal/astro-renderer@0.3.11
  - @cloudhal/mcp-server@0.3.11
  - @cloudhal/agent-runtime@0.3.11
  - @cloudhal/analytics@0.3.11
  - @cloudhal/comments@0.3.11
  - @cloudhal/schedules@0.3.11
  - @cloudhal/storage@0.3.11

## 0.3.10

### Patch Changes

- Updated dependencies [46f59d5]
  - @cloudhal/astro-renderer@0.3.10
  - @cloudhal/mcp-server@0.3.10
  - @cloudhal/agent-runtime@0.3.10
  - @cloudhal/analytics@0.3.10
  - @cloudhal/comments@0.3.10
  - @cloudhal/core-contracts@0.3.10
  - @cloudhal/core-ts@0.3.10
  - @cloudhal/schedules@0.3.10
  - @cloudhal/storage@0.3.10

## 0.3.9

### Patch Changes

- Updated dependencies [348a00a]
  - @cloudhal/astro-renderer@0.3.9
  - @cloudhal/mcp-server@0.3.9
  - @cloudhal/agent-runtime@0.3.9
  - @cloudhal/analytics@0.3.9
  - @cloudhal/comments@0.3.9
  - @cloudhal/core-contracts@0.3.9
  - @cloudhal/core-ts@0.3.9
  - @cloudhal/schedules@0.3.9
  - @cloudhal/storage@0.3.9

## 0.3.8

### Patch Changes

- Updated dependencies [da8fe6f]
  - @cloudhal/mcp-server@0.3.8
  - @cloudhal/agent-runtime@0.3.8
  - @cloudhal/analytics@0.3.8
  - @cloudhal/astro-renderer@0.3.8
  - @cloudhal/comments@0.3.8
  - @cloudhal/core-contracts@0.3.8
  - @cloudhal/core-ts@0.3.8
  - @cloudhal/schedules@0.3.8
  - @cloudhal/storage@0.3.8

## 0.3.7

### Patch Changes

- @cloudhal/agent-runtime@0.3.7
  - @cloudhal/analytics@0.3.7
  - @cloudhal/astro-renderer@0.3.7
  - @cloudhal/comments@0.3.7
  - @cloudhal/core-contracts@0.3.7
  - @cloudhal/core-ts@0.3.7
  - @cloudhal/mcp-server@0.3.7
  - @cloudhal/schedules@0.3.7
  - @cloudhal/storage@0.3.7

## 0.3.6

### Patch Changes

- @cloudhal/agent-runtime@0.3.6
  - @cloudhal/analytics@0.3.6
  - @cloudhal/astro-renderer@0.3.6
  - @cloudhal/comments@0.3.6
  - @cloudhal/core-contracts@0.3.6
  - @cloudhal/core-ts@0.3.6
  - @cloudhal/mcp-server@0.3.6
  - @cloudhal/schedules@0.3.6
  - @cloudhal/storage@0.3.6

## 0.3.5

### Patch Changes

- @cloudhal/agent-runtime@0.3.5
  - @cloudhal/analytics@0.3.5
  - @cloudhal/astro-renderer@0.3.5
  - @cloudhal/comments@0.3.5
  - @cloudhal/core-contracts@0.3.5
  - @cloudhal/core-ts@0.3.5
  - @cloudhal/mcp-server@0.3.5
  - @cloudhal/schedules@0.3.5
  - @cloudhal/storage@0.3.5

## 0.3.4

### Patch Changes

- d6427d5: Agent keys are also accepted as `Authorization: Bearer <key>` (what most MCP clients and Codex's `bearer_token_env_var` send), on `/mcp` and wherever `x-api-key` was. `/api/admin/*` keeps its deployment-token bearer and never reads it as an agent key.
- Updated dependencies [aae143f]
  - @cloudhal/mcp-server@0.3.4
  - @cloudhal/agent-runtime@0.3.4
  - @cloudhal/analytics@0.3.4
  - @cloudhal/astro-renderer@0.3.4
  - @cloudhal/comments@0.3.4
  - @cloudhal/core-contracts@0.3.4
  - @cloudhal/core-ts@0.3.4
  - @cloudhal/schedules@0.3.4
  - @cloudhal/storage@0.3.4

## 0.3.3

### Patch Changes

- 54a524c: A `CLOUDHAL_DEPLOY_TOKEN` shorter than 32 characters no longer makes every `/api` request fail with 500. Only `/api/admin` is disabled (503 `deploy_token_invalid`): the error is logged once, `/api/health` reports `problems: ["deploy_token_invalid"]`, and sign-in and Studio keep working. The Workers Builds setup steps and the Deploy button guide now say not to edit `CLOUDHAL_DEPLOY_TOKEN`, because every build replaces it.
- @cloudhal/agent-runtime@0.3.3
  - @cloudhal/analytics@0.3.3
  - @cloudhal/astro-renderer@0.3.3
  - @cloudhal/comments@0.3.3
  - @cloudhal/core-contracts@0.3.3
  - @cloudhal/core-ts@0.3.3
  - @cloudhal/mcp-server@0.3.3
  - @cloudhal/schedules@0.3.3
  - @cloudhal/storage@0.3.3

## 0.3.2

### Patch Changes

- @cloudhal/agent-runtime@0.3.2
  - @cloudhal/analytics@0.3.2
  - @cloudhal/astro-renderer@0.3.2
  - @cloudhal/comments@0.3.2
  - @cloudhal/core-contracts@0.3.2
  - @cloudhal/core-ts@0.3.2
  - @cloudhal/mcp-server@0.3.2
  - @cloudhal/schedules@0.3.2
  - @cloudhal/storage@0.3.2

## 0.3.1

### Patch Changes

- Updated dependencies [4a46df0]
  - @cloudhal/storage@0.3.1
  - @cloudhal/agent-runtime@0.3.1
  - @cloudhal/analytics@0.3.1
  - @cloudhal/astro-renderer@0.3.1
  - @cloudhal/comments@0.3.1
  - @cloudhal/core-ts@0.3.1
  - @cloudhal/mcp-server@0.3.1
  - @cloudhal/schedules@0.3.1
  - @cloudhal/core-contracts@0.3.1

## 0.3.0

### Minor Changes

- 346781b: Playground mode (RFC-0036): `createApi({ playground: { info } })` answers every request as the fixed `PLAYGROUND_PRINCIPAL` (an Editor with site settings and nothing installation-wide or upload-related), refuses blocked routes with `403 {error: "playground"}` through the pure `isBlockedInPlayground(method, path)` guard (also exported for the playground Worker), limits request bodies, and reports `features.playground` in `/api/instance`. Every declared route is either blocked or allowed, and a route on neither list is refused. Studio shows a session bar (time left, Reset, Deploy to Cloudflare) and leaves out team, agent and account screens on a playground.

### Patch Changes

- Updated dependencies [a28c22e]
- Updated dependencies [c70d3fa]
  - @cloudhal/astro-renderer@0.3.0
  - @cloudhal/storage@0.3.0
  - @cloudhal/mcp-server@0.3.0
  - @cloudhal/agent-runtime@0.3.0
  - @cloudhal/analytics@0.3.0
  - @cloudhal/comments@0.3.0
  - @cloudhal/core-ts@0.3.0
  - @cloudhal/schedules@0.3.0
  - @cloudhal/core-contracts@0.3.0

## 0.2.0

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
- Updated dependencies [e4b1c83]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/astro-renderer@0.2.0
  - @cloudhal/mcp-server@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/agent-runtime@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/schedules@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- `npm create cloudhal` and `npm install @cloudhal/cli` no longer hang. `@better-auth/api-key` names `@better-auth/core`, `@better-auth/utils` and `better-call` as open peers; npm picked newer releases whose peers conflict with better-auth 1.7.7's and backtracked forever (0.1.0). `@cloudhal/api` now depends on exactly the versions better-auth itself uses, so npm resolves the tree in seconds.
- @cloudhal/agent-runtime@0.1.1
  - @cloudhal/analytics@0.1.1
  - @cloudhal/astro-renderer@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/mcp-server@0.1.1
  - @cloudhal/schedules@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
