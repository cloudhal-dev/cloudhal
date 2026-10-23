---
"@cloudhal/cli": minor
"@cloudhal/api": minor
---

Collections stage 3, step 5 (RFC-0042 §7 / ADR-0044): Studio.

- **Collection settings** get three cards, each saved on its own: **Listing fields** (up to four fields, ordered; a field content lists still use names those pages), **Expiry** (a date or date-and-time field, "Leave lists" or "Hide the page" explained in words, a grace in minutes, and how many published entries are already past it; a site Worker that does not apply expiry yet says to deploy first) and **Structured data** (Event, Job posting, Product or Recipe; every property offers only the sources that fit it, required ones are marked, problems show while editing, and a chosen entry's JSON-LD is previewed with a link to Google's Rich Results Test).
- **Create listing page** makes a draft page at the collection's address with a content list of it (upcoming first for a collection with a date listing field and an expiry) and opens it; when a page already lives there, the action opens that page.
- **Collection lists** show listing fields as columns, filter by them and sort by number and date fields. Filters and sort live in the URL and ask the API by field, one page at a time.
- **Page editor**: content list sections get conditions and an order by the collection's listing fields; refused conditions show on their row.
- Words for `invalid_query`, `structured_data_invalid`, `invalid_expiry`, `list_field_in_use` and `gates_unsupported`, the `preview_structured_data` tool and the expiry auto-publish check. Translations are AI drafts awaiting review.
- `@cloudhal/api`: new read-only `GET /api/sites/:siteId/entries/:entryId/structured-data` (`content:read`), the REST twin of MCP's `preview_structured_data`: the preset document an entry's page emits, its issues and the preset's warnings.
