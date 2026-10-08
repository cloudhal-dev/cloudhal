# ADR-0017: Taxonomy and redirects are graph nodes; content references terms by id
- Status: Accepted
- Date: 2026-10-08
- Related: RFC-0002 (the design; this ADR records the decision), RFC-0001, ADR-0001, ADR-0002, ADR-0014, ADR-0015
- Sources: Ghost source (TryGhost/Ghost `main` ad3d9ce: `posts_tags.sort_order`, primary-tag logic, internal tags), WordPress `register_taxonomy` and term tables, Contentful Taxonomy (SKOS concepts, locale-independent assignment), W3C SKOS Reference, Google Search Central (faceted navigation 2024-12, pagination, canonicalization, soft 404) — full list in RFC-0002 and the research behind it

## Context
Taxonomy was one field: `ContentEntry.tags`, up to 50 free slugs. Tags had no name, description or archive; there were no categories, no hierarchy and no primary term. Agents could not see the vocabulary, so near-duplicate tags were inevitable. A rename meant N entry writes and N snapshots. Changing a published slug broke its URL silently. Ghost (flat tags, primary = first public tag, no merge or redirects) and WordPress (shared terms that 4.2 had to split, no term redirects in core) show the failure modes to avoid.

## Decision
Adopt RFC-0002 as accepted, with the recommended answers to its open questions:

- **Nodes.** `Taxonomy` (`tax_`), `Term` (`term_`) and `Redirect` (`redir_`) are site-scoped graph nodes with `rev`, CAS and snapshots. The store uses an explicit node-kind registry instead of duck typing, and no document may be valid under two node schemas.
- **Assignment.** Entries reference terms by id, independent of locale: `terms: {[taxonomyKey]: {ids, primary?}}`. The primary term is explicit, never derived from order.
- **Default taxonomies.** `category` is hierarchical and required for review/published entries on new sites; only people create categories (`allowNewTerms: "none"`). `tag` is flat; agents propose tags (`"propose"`), and a proposed tag has no public URL until a person approves it.
- **Terms.** Names, synonyms (`altNames`), description and SEO are per locale. There is one slug per term (localized slugs come with locale routing). An optional `position` orders siblings.
- **Governance operations.** Rename, merge, retire, move and review are one `batch()` and one snapshot each. They are approval-gated over MCP and leave 301 redirects. Operations touching more than 400 entries are refused in v1.
- **Redirects.** They are created automatically when a published entry's slug or a published page's path changes, and when terms are renamed, merged or retired. Chains are collapsed and loops refused; agents cannot create external redirects. Retired terms without a redirect answer **410**. URL-changing nodes always count as "structure" in `auto` mode.
- **Archives.** Pagination is self-canonical. Archives below `minEntriesToIndex` are `noindex, follow` and left out of sitemaps; empty and proposed terms are 404. Category archives include sub-categories. There is one filter grammar for the API, MCP, `ContentList` and feeds.
- **Compatibility.** Every change is additive (`schemaVersion` stays 1). `tags → terms` is migrated with a revertible command. On existing sites `category.required` starts false, and no "Uncategorized" term is created.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Ghost-style flat tags + "first tag is primary" | Simple, proven | Primary depends on order and visibility; no hierarchy, merge or synonyms | Publishers expect categories; agents need a governed vocabulary |
| WordPress-style shared terms across taxonomies | Fewer rows | Shared terms had to be split in WP 4.2 | One (term, taxonomy) pair, never shared |
| Terms embedded in the Site node | One node to read | Every term edit rewrites the site; no per-term rev, CAS or snapshot diff | Conflicts and noisy diffs |
| SKOS polyhierarchy now | Most expressive | Harder UI, invariants and archives | `parentId` now; the shape allows `broader[]` later |

## Consequences
- **Positive:**
  - A rename changes one node.
  - Agents see and reuse the vocabulary.
  - URL changes leave redirects.
  - Archives are SEO-safe by default.
  - Approvers see taxonomy deltas explicitly.
- **Negative:**
  - Three new node kinds across store, sync, renderer, MCP and Studio.
  - Cross-node invariants need batch-guarded SQL (an `op_guards` assertion row, migration 0011).
  - `tags` lingers, deprecated, for one release.
- **Risks:**
  - Guard statements must stay within D1's bound-parameter limits (entries are capped at 60 term ids).
  - Very large merges are refused until a staged job exists.
