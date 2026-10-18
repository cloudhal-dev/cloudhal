---
name: translate
description: Draft or update Cloudhal Studio translations (any language in apps/studio/src/i18n/locales.ts) from the English catalogs, as ICU MessageFormat in the exchange JSON, then import and check them. Use when a language needs new or changed strings, or a new language needs a first draft. Drafts are machine translations awaiting review; never mark a language reviewed.
license: Apache-2.0
metadata:
  cloudhal.kind: "repo-skill"
  cloudhal.area: "area:studio"
---

# Translate Studio

Studio's catalogs live in the repo (ADR-0034). **Only English is edited by hand** (`apps/studio/src/i18n/en.ts`, `lazy/<ns>.en.ts`); every other language is generated from translation files by `pnpm i18n:import`, and a hand edit fails `pnpm check`. This skill drafts those translation files. It uploads nothing and never approves anything: people review on the translation platform (or the owner, for now), and only they set `reviewed: true` in `locales.ts`.

## Steps

1. `pnpm i18n:export` writes `.i18n/<locale>/<file>.json` (nested, ICU MessageFormat 1 values) for every language and `.i18n/descriptions.json` (each key's English text and its note). `<file>` is `core` or a namespace.
2. For the target language, translate what is missing or changed — compare `.i18n/en/<file>.json` with `.i18n/<locale>/<file>.json` (a new language: copy the English files and translate every value). Read the key's note in `descriptions.json`.
3. Write the translated JSON back to `.i18n/<locale>/`. Same keys, same nesting, same order as English.
4. `pnpm i18n:import --locale <locale>`: checks keys and ICU syntax, rewrites the catalogs, runs `test/i18n.test.tsx` and `test/i18n-messages.test.ts`. Fix what they report and import again.
5. `pnpm design:lint` and the Studio typecheck must pass; open a PR that says the strings are AI drafts awaiting review.

## Rules for the messages (DESIGN.md §1 "Message syntax", RFC-0032)

- Keep every `{argument}` and its kind: a `plural`/`number` argument stays a number (Turkish may write `{count, number} dosya`, since its nouns stay singular after a number); a `select` stays a `select` with the same values plus `other`. Never invent an argument; a form other than English's only where `en.ts` declares it in `forms`.
- Give a `plural` every category the language has: `new Intl.PluralRules("<locale>").resolvedOptions().pluralCategories` (Russian: one, few, many, other; Arabic: zero, one, two, few, many, other). `#` is the number.
- Translate whole sentences; when a word must change with a value, keep or write a `select` with whole sentences — never glue words.
- A literal `{`, `}` or (inside a plural) `#` is quoted: `'{}'`, `'#'`.
- Keep product and technical names as they are (Cloudhal, Studio, Snapshot, Release, MCP, Markdown, URL, API, SEO). Use the language's usual UI register (Turkish and German Studio use the informal "sen"/"du"; privacy notices to site visitors are formal).
- An argument the language cannot use at all (a case suffix on an arbitrary name) is declared in that language's `dropped` export, with the reason — the import keeps it.

## Never

- Edit `apps/studio/src/i18n/<locale>.ts` or `lazy/<ns>.<locale>.ts` by hand for any locale but `en`.
- Set `reviewed: true`, or present a draft as reviewed.
- Upload to a translation platform or send strings outside the repo (platform hosting is the owner's decision, ADR-0034).
