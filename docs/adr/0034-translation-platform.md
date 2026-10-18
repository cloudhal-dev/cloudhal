# ADR-0034: Translation workflow — catalogs stay in the repo, ICU JSON exchange, Weblate self-hosted (or Tolgee), AI drafts reviewed by people
- Status: Accepted (2026-10-18, by Halil, as recommended). The open questions below stay open for the owner: platform hosting, reviewers, visitor-facing strings.
- Date: 2026-10-18
- Related: `docs/reports/2026-10-studio-i18n-review.md` (Phase 4), ADR-0032 (ICU messages, compiled), DESIGN.md §1 ("Languages", "Adding a language"), the locale registry's `reviewed` flag
- Sources:
  - Weblate: file formats (JSON, nested JSON, i18next JSON, gettext PO, XLIFF 1.2/2.0) https://docs.weblate.org/en/latest/formats.html; the ICU MessageFormat quality check (`icu-message-format`, syntax and placeholder mismatches) https://docs.weblate.org/en/latest/user/checks.html; licence GNU GPL v3+ (https://pypi.org/project/weblate/); hosted service with a programme for libre projects https://weblate.org/en/hosting/
  - Tolgee: ICU MessageFormat in the platform and SDKs https://docs.tolgee.io/platform/translation_process/icu_message_format; core open source (Apache-2.0) with an enterprise layer, self-hosting by Docker https://github.com/tolgee/tolgee-platform; in-context editing and machine translation https://docs.tolgee.io/
  - Crowdin: ICU message syntax (plural, select, number, date) with highlighting and preview https://support.crowdin.com/icu-message-syntax/; supported formats https://support.crowdin.com/supported-formats/; open-source programme https://crowdin.com/page/open-source-project-setup-request
  - Lokalise: ICU plural detection on upload (vendor guide) https://lokalise.com/blog/complete-guide-to-icu-message-format/; supported formats https://docs.lokalise.com/en/collections/2909229-supported-file-formats
  - XLIFF 2.1: https://docs.oasis-open.org/xliff/xliff-core/v2.1/xliff-core-v2.1.html

## Context
Studio's catalogs are TypeScript modules: `apps/studio/src/i18n/<locale>.ts` and `lazy/<ns>.<locale>.ts`.
- English is the source and the type. The other languages are typed against it, and since ADR-0032 they are ICU MessageFormat 1.
- Checks guard keys, argument kinds, plural categories, declared forms and drops, unused keys, and English sentences left untranslated (`test/i18n*.test.ts`).
- German was added as an AI draft (`reviewed: false`). Turkish is maintained by the owner.

More languages need four things:
- people outside the repo editing translations;
- a review state per string;
- machine or AI drafts that a person approves;
- an import back into the repo that the checks validate.

Pricing changes often, so it is linked, not quoted. Check the pages when deciding.

## Options

### Exchange format
| Format | Fit |
|---|---|
| **Nested JSON with ICU MF1 values**, one file per namespace and locale, plus a sidecar of descriptions | What all four platforms import. Keeps ICU intact (ADR-0032). Nesting maps 1:1 to our keys. |
| XLIFF 2 | For agencies and CAT tools. A second export, if a vendor asks |
| gettext PO | Source-text oriented; ICU plurals would have to be flattened to `msgstr[n]`. No |

### Platform
| Platform | Model and licence | ICU | Review states / MT | Hosting and cost | Fit |
|---|---|---|---|---|---|
| **Weblate** | Libre (GPL v3+); self-host or the hosted service | ICU quality check (syntax, placeholders); JSON / nested / i18next JSON | Needs-editing, translated, approved (reviewers); machine translation add-ons, including LLM back ends | Self-host on any container host; hosted plans, with a programme for libre projects | Git-native: pushes translations back as commits or PRs. Strongest fit for an Apache-2.0 open-source project |
| **Tolgee** | Open-source core (Apache-2.0) and an enterprise layer; self-host (Docker) or cloud | ICU native | States and MT/AI translation; **in-context editing** (Alt+click in the running app) | Self-host free for a small team (vendor); cloud plans | Best translator UX (in context). The SDK model is built around its own runtime, but plain file import/export works without the SDK |
| Crowdin | SaaS | ICU syntax with highlighting and preview | Proofreading, approvals, MT and AI pre-translation | Paid plans; open-source programme | Polished SaaS with GitHub integration; not self-hostable |
| Lokalise | SaaS | ICU plurals (detected on upload) | Review statuses; MT and AI | Paid plans (free tier limited) | Strong product teams' tool; no self-hosting, no open-source programme found |

### AI-first drafts
A Claude Code skill, `.agents/skills/translate` (six spec fields, AGENTS.md rule 8). It reads:
- the export JSON;
- descriptions;
- a glossary (product terms kept as they are: Cloudhal, Snapshot, Release, Studio);
- DESIGN.md's tone rules;
- per language: formality (`du`/`sen`/…) and the CLDR plural categories.

It writes ICU strings for every category the language needs, then runs `pnpm i18n:check`. Its drafts are uploaded as "needs review" (Weblate: needs editing; Tolgee/Crowdin: unreviewed). This follows the agent-native direction, and German's pilot already followed the pattern.

## Decision (recommended)
1. **The repo stays the source of truth.**
   - `en.ts` is edited by developers; it is the type.
   - Translations flow through `pnpm i18n:export` / `pnpm i18n:import`, which write nested ICU JSON plus descriptions and regenerate `<locale>.ts` / `lazy/<ns>.<locale>.ts`.
   - Every import runs the existing checks and opens a PR. Generated catalog files are committed, as contract types are (AGENTS.md rule 1).
2. **Weblate, self-hosted** (or its hosted libre programme): libre, Git-native, ICU-checked, reviewers built in. **Tolgee is the alternative** if in-context editing matters more than Git-native flow. A short trial of both on German (`reviewed: false` today) decides, with a German reviewer.
3. **Review states map to the registry.** A language becomes `reviewed: true` when all its strings are approved in the platform; the import computes this.
4. **AI drafts:** the `translate` skill produces first drafts and uploads them as needing review. People approve. The skill never marks a string approved.
5. **XLIFF 2** only on demand, from the same export.

## Consequences
- Positive:
  - translators work in a proper tool;
  - reviews are visible;
  - the repo's checks still guard every import;
  - no vendor lock-in, because the exchange format is portable.
- Negative:
  - export and import scripts to maintain;
  - hosting Weblate or Tolgee, a container and a database, if self-hosted.
- Risks:
  - two-way edits (a developer changes `de.ts` while a translator changes the platform). Mitigation: catalogs other than English are generated, and only English is edited by hand. This is a lint rule once the import exists.
  - MF2: none of the four platforms documents MessageFormat 2 import/export yet (RFC-0032, open question 1). The ICU MF1 exchange stays until they do.

## Decisions (2026-10-18)
The owner delegated the open questions; decided in the session that coordinates the i18n work:

- **Platform: Hosted Weblate, Libre plan.** No self-hosting.
  - The plan is for public projects, and is set up from https://hosted.weblate.org/hosting/.
  - Its limit is 160,000 hosted strings, counted as source strings × (languages + 1). Studio has about 4,550 keys, so en plus tr, de and ar is about 18,200.
  - **The owner creates the account and applies; agents never create accounts.** The steps are in `docs/guides/translations-weblate.md`.
- **Reviewers:** German and Arabic stay `reviewed: false` until community reviewers approve them in Weblate. Turkish stays reviewed (the owner).
- **Until then:** an AI second-pass consistency review (glossary, register, terms) may correct the drafts through the `translate` skill and `pnpm i18n:import`. It never sets `reviewed: true`.
- **Visitor-facing strings** (themes, notices) stay out of scope for now. The catalogs remain Studio-only.

## Open questions
None left from this ADR; the questions below were answered above.
- *(answered)* Hosting: Hosted Weblate, Libre plan.
- *(answered)* Reviewers: community reviewers in Weblate for German and Arabic; the owner for Turkish.
- *(answered)* Visitor-facing strings: not now.
