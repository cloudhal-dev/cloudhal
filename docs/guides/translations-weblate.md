# Translations on Hosted Weblate: the owner's steps

Studio's translations move to **Hosted Weblate on the Libre plan** (ADR-0034, decisions of 2026-10-18). Agents prepare everything in the repo but **never create accounts or apply on your behalf**. This page lists what only you can do.

What the Libre plan is, from https://weblate.org/en/hosting/:
- free hosting for **public** projects;
- set up from https://hosted.weblate.org/hosting/;
- the same limits as the 160k plan: **160,000 hosted strings**, counted as source strings × (languages + 1), with unlimited projects, components and translators.

Studio has about 4,800 message keys and 18 languages besides English (`apps/studio/src/i18n/locales.ts`), so all of them together are about 90,000 hosted strings, within the limit.

## 1. Account and project (you)

1. Sign in at https://hosted.weblate.org (your GitHub account works). Use your own account, never a shared or bot one.
2. Open https://hosted.weblate.org/hosting/ and start a **Libre** project for Cloudhal. Describe it as "Cloudhal Studio, the admin app of an open-source (Apache-2.0) site platform", and give the repository URL https://github.com/cloudhal-dev/cloudhal.
3. If Weblate asks for anything beyond what is listed here (a review of the project, a contact), answer it yourself. Write to sales@weblate.org if the hosting page is unclear.

## 2. Repository access (you)

Weblate is Git-based: it reads the translation files from a branch and pushes translators' work back as commits.
- Give Weblate access to the repository the way its project settings offer: a deploy key, or the Weblate GitHub app.
- Allow push to the **`i18n` branch** only, never `main`.
- An agent prepares that branch (see 4). Translations reach `main` only through a pull request that runs `pnpm i18n:import` and its checks.

## 3. Components (you, or tell an agent the project URL and it writes the exact values)

One Weblate component per catalog file, all in the same project:

| Setting | Value |
|---|---|
| File format | JSON nested structure file (`json-nested`) |
| Monolingual base (template) | `i18n/en/<file>.json`; `<file>` is `core` or a namespace (`analytics`, `comments`, …) |
| File mask | `i18n/*/<file>.json` |
| Source language | English |
| Quality checks (flags) | `icu-message-format` (ICU syntax and placeholders, RFC-0032) |
| Languages | every language in `apps/studio/src/i18n/locales.ts`: Turkish (reviewed, by you), the others machine drafts for community review |

Turn on **reviews** (translated → approved), so "approved by a reviewer" is what makes a language `reviewed: true` in `apps/studio/src/i18n/locales.ts`.

## 4. What agents do, and what stays yours

| Agents (in PRs you review) | You |
|---|---|
| Maintain the `i18n` branch with `pnpm i18n:export` output under `i18n/` (follow-up PR, once the project exists) | Create the account, apply, accept Weblate's terms |
| Import Weblate's commits with `pnpm i18n:import` and run the checks | Give repository access (push to `i18n` only) |
| Draft new strings and run the AI consistency pass (`translate` skill), uploading nothing themselves | Invite and approve reviewers; decide when a language is `reviewed: true` |
| Keep English the only hand-edited catalog | Settle disputes about terms (glossary) |

## 5. Not in scope yet

Visitor-facing strings (themes, privacy notices on sites) are not on Weblate yet (ADR-0034).
