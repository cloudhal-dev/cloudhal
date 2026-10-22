# ADR-0043: Typed custom fields: nine closed types on `Site.collections.<key>.fields`, one eval-free checker, explicit field operations
- Status: Accepted
- Date: 2026-10-23 (decided by Halil)
- Related: RFC-0041, RFC-0040 / ADR-0042, RFC-0015 / ADR-0030, RFC-0033 / ADR-0035, RFC-0008 / ADR-0023, #71
- Sources: [Payload fields](https://payloadcms.com/docs/fields/overview) and [localization](https://payloadcms.com/docs/configuration/localization) · [Sanity validation](https://www.sanity.io/docs/studio/validation) · [Webflow create field](https://developers.webflow.com/data/reference/cms/collection-fields/create) · [Wix item limits](https://support.wix.com/en/article/cms-understanding-collection-storage-limits-and-quotas) · [Strapi field rename request](https://feedback.strapi.io/developer-experience/p/gracefully-handle-renaming-of-content-types-and-fields-in-the-ctb) · [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) · [Anthropic structured outputs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs) · [Cloudflare D1 limits](https://developers.cloudflare.com/d1/platform/limits/)

## Context
Collections are first-class since ADR-0042. An entry's collection-specific values still go into `ContentEntry.fields` as untyped JSON. Agents guess the shape, people get no form, and themes cannot rely on any value. The prior art shows the hazards: Strapi and ACF lose data when a field is renamed in a builder, and Sanity checks values only in its Studio.

## Decision
1. **Contract:** optional `CollectionSettings.fields`, an ordered list of 1–30 `FieldDefinition`s. There is no `schemaVersion` bump.
   - **Types:** a `oneOf` of nine closed variants: `text`, `richText` (Cloudhal Markdown v1), `number`, `boolean`, `date` (`YYYY-MM-DD`), `datetime` (`{at, timeZone}`, ADR-0023 §9.1), `url` (https, http, mailto, tel, relative), `image` (an asset id of the same site), and `select` (closed options, optional `multiple`).
   - **Common properties:** every variant has `key`, `labels` and `localized`; all but `boolean` can have `requiredToPublish`.
   - **Keys:** lower camelCase. Built-in entry properties and prototype names are reserved.
   - **Not offered:** `pattern` and defaults.
2. **Discriminator `type`.** AGENTS.md rule 2 now reads "a one-value enum discriminator, `kind` unless the domain says otherwise"; field types say `type`, like every CMS and the props subset.
3. **Values** stay in `ContentEntry.fields`, up to 256 KB per entry.
4. **One checker, three callers.** `@cloudhal/core-ts/fields` is eval-free and built on ADR-0030's `validateProps`.
   - The store, the API and MCP's precheck all call it, and it checks only the values that changed.
   - Once a collection has definitions, new unknown keys are refused.
   - It emits the JSON Schema agents receive, limited to what both OpenAI and Anthropic strict modes accept.
5. **Requirements:** `requiredToPublish` is checked when an entry is written in review or published, like `required_term`. Drafts save freely.
6. **Localization**, chosen per field:
   - localized values live on each locale's entry and, when empty, fall back to the original's value (`fromOriginal`);
   - non-localized values live only on the translation group's original.
7. **Definitions stay on the site node**, capped at 200 fields per site and 256 KB for `collections`. A `Collection` node kind is the fallback if the cap is reached.
8. **Definition changes:**
   - A plain edit never loses a value: `updateSite` refuses a risky one (`field_change_needs_operation`).
   - `rename_field`, `change_field_type` (a closed conversion table) and `set_field_localized` are explicit operations, and so is `remove_field`. Each has a dry run, a snapshot before it runs, and approval by a person holding `site:settings`, in every mode.
   - Each runs as resumable phases of guarded atomic batches (rule 4), and touches only the draft graph.
9. **Surfaces:**
   - **Studio:** a generated, lazy entry form and a fields builder in the collection's settings.
   - **MCP:** `list_collections` returns `fields` and `fieldsSchema`, and `update_entry` gains `fields`.
   - **Themes:** additive exports (`resolveFields`, `formatFieldValue`, `EntryFields.astro`).
   - **Search:** a field is indexed only when it is marked `searchable` (default false).
   - **Import and pull:** invalid values are reported, not refused.
10. **Later:** field columns and filters in Studio lists, JSON-LD presets, expiry automations, reference fields, and `localTime` on `datetime`.

## Consequences
- Positive:
  - Agents write typed, checked values, and the person approving sees them.
  - People get forms.
  - Renames and type changes are safe and reversible.
  - Themes get resolved values.
- Negative:
  - The site node grows with definitions; the caps bound it.
  - Field operations add four tools and a resumable runner.
  - Rule 2 now has an exception.
- Risks:
  - **Two checkers:** a write path that skips `@cloudhal/core-ts/fields` would let unchecked values in. Every write goes through one store helper.
  - **Rust numbers:** the Rust mirror writes `0` as `0.0`. The Rust core needs canonical number output (RFC 8785) before it writes nodes.
