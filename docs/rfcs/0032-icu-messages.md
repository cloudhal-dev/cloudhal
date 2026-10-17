# RFC-0032: ICU plurals and select in Studio messages, compiled at build time
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-18
- Related:
  - `docs/reports/2026-10-studio-i18n-review.md` (Phase 1 of its plan; the measurements below update it);
  - DESIGN.md §1 (message catalogs, lazy namespaces, the locale registry and "Adding a language");
  - AGENTS.md hard rules 5 (Worker-safe imports), 6 (no `eval`), 10 (no hard-coded words) and 12 (size ratchet);
  - PRs #149 (one language per page), #151 (no hard-coded words, `apiErrorText`), #152 (locale registry, German).

## Summary
Studio's messages gain the ICU MessageFormat 1 constructs a translation needs and English hides: `plural` (CLDR categories, exact `=n`, `#`), `select`, `selectordinal` and `number` arguments. A Vite plugin compiles every catalog string into a small, data-only form at build time, so no parser ships and nothing evaluates code. A generated type file gives each key its parameter types. Keys in code, lazy namespaces, the locale registry and the one-language-per-page loading stay as they are. The 46 `…One` pairs, the count ternaries, the `role`/`roles` and `plural`/`singular` work-arounds and the sentence fragments then migrate mechanically, and a new language can use its real plural forms. Today Russian, Ukrainian, Polish and Arabic cannot be added correctly.

## Motivation
Measured on `main` at `95dc4cd` (en, tr, de; 4,654 keys per language, 13,962 strings):

| Work-around | Count | Example |
|---|---:|---|
| `…One` / `…Many` key pairs (English's two plural forms by hand) | 46 (47 matched; `proposals.chooseOne` is not a plural) | `editor.wordsOne: "1 word"` + `editor.wordsOther: "{count} words"` |
| `count === 1 ? t(a) : t(b)` ternaries and the `plural()` helper | 26 | `components/Comments.tsx` `plural(t, k, kOne, n)` |
| Sentences assembled from fragments | 6+ | `menus.delta.withBelowOne` appended into `menus.delta.add`; `` `${t(a)} ${t(b)}` `` in `AnalyticsSettings.tsx` |
| Lists joined with `", "` | 35 | `menus.join(", ")` (Arabic uses `، `, Japanese `、`) |
| Placeholder mismatches en↔tr (grammar) | 45 | `gating.abilities.*`: English `{roles}`, Turkish `{role}`; `taxonomy.*`: `{plural}` vs `{singular}`; 4 messages drop a slot |
| Placeholder mismatches en↔de | 0 | German has English's one/other categories |

Who is affected:
- **Every language beyond one/other.** The CLDR plural rules ([chart][cldr-plurals]) give Russian, Ukrainian and Polish four categories, so `21 файл`, `22 файла` and `25 файлов` need three different forms. Arabic has six, and Japanese and Chinese have one. `=== 1` is wrong for 21, 22–24, 101, … in the Slavic languages and for 0, 2 and 3–10 in Arabic. The "Adding a language" checklist (DESIGN.md §1) therefore blocks these languages until this RFC lands.
- **Translators and agents**, who today must keep two keys in step and guess which fragment goes where.
- **Developers**, who write a ternary at every count and pass several grammatical forms "just in case" (`useMe.ts` passes both `role` and `roles`).

Why now: German proved that the registry, the checks and the bundle model work. Phase 3 (RTL) and Phase 4 (translation platform) both build on the message syntax, and the platforms all speak ICU MessageFormat 1.

## Proposal

### 1. Message syntax: an ICU MessageFormat 1 subset
A catalog value stays a string. These forms are allowed ([ICU user guide][icu-mf]):

```text
{name}                                   simple argument (unchanged; string or number)
{count, number}                          number in the locale (Intl.NumberFormat)
{ratio, number, percent}                 also: integer, compact
{count, plural, =0 {…} one {…} other {…}}   CLDR cardinal categories, exact =n, # = the number
{place, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}
{kind, select, page {…} contentEntry {…} other {…}}
```

Rules:
1. `other` is required in every `plural`, `selectordinal` and `select` (ICU's rule; it keeps a newer server value from breaking the sentence).
2. `#` is the plural argument formatted with `Intl.NumberFormat(locale)`. `{count}` inside a plural branch is also allowed and is formatted the same way.
3. No `offset:`, no `date`/`time` arguments and no custom styles or skeletons. Dates and times are formatted by the caller (the Phase 2 `Intl` layer) and passed as strings. This keeps the subset small and maps one-to-one onto MessageFormat 2.
4. Quoting follows ICU's "double optional" apostrophe mode, which is also ICU4J's default and FormatJS's. An apostrophe quotes only when followed by `{`, `}`, `#` (in a plural) or `|`, so "don't" stays as written. Today exactly three strings (`aiSettings.unavailable.description` in en/tr/de) contain literal braces, and the codemod quotes them as `'{}'`.
5. Selects and plurals nest (a plural inside a select branch). Inside a sentence, every branch is a whole phrase. The rule for translators: write each branch so it reads as a complete phrase.

**Mapping to MessageFormat 2.** MF2 is stable since CLDR 47 (2025-03-13, [release][cldr47], [spec][mf2]). `Intl.MessageFormat` is a TC39 Stage 1 proposal ([proposal][tc39-mf]), and its JS implementation `messageformat` v4 is still a prerelease ([npm][mf2-npm]). The subset is chosen so that each construct has a direct MF2 form:

| MF1 (this RFC) | MF2 |
|---|---|
| `{name}` | `{$name}` |
| `{n, number, percent}` | `{$n :number style=percent}` (or `:percent`) |
| `{n, plural, one {# file} other {# files}}` | `.input {$n :number} .match $n one {{{$n} file}} * {{{$n} files}}` |
| `{n, plural, =0 {none} …}` | variant key `0` |
| `{n, selectordinal, …}` | `.input {$n :number select=ordinal}` |
| `{k, select, page {…} other {…}}` | `.input {$k :string} .match $k page {{…}} * {{…}}` |

The compiler's output (section 2) is a small data model with selectors, variants and parts. It is closer to MF2's data model than to MF1's syntax. So moving later means changing the parser (and the catalogs, by a lossless codemod), not the runtime or any call site. Catalogs stay MF1 now because translation platforms read ICU MF1 today. MF2 import and export are not documented by the four platforms we compared (open question 1).

### 2. Where messages are parsed: at build time, into data
- **Compiler** (`packages/messages/src/compile.ts`, new private package `@cloudhal/messages`, no dependencies): parses a string into a message, or into a precise error with its column. It runs:
  - in a Vite plugin (`cloudhal:messages`) that transforms `apps/studio/src/i18n/*.ts` and `i18n/lazy/*.ts` modules in dev, build and Vitest;
  - in the type generator (section 3);
  - in the catalog tests and checks (section 5).
- **Output.** A message without arguments stays a string, and so does one with only `{name}` arguments: the runtime keeps today's `replace` for those. That is about 95% of messages, which stay byte-identical. Only messages with `plural`/`select`/`selectordinal`/`number` become JSON data, for example:

  ```ts
  // "{count, plural, one {# word} other {# words}}" becomes
  { s: [["count", "plural"]], v: [[["one"], ["#", " word"]], [["other"], ["#", " words"]]] }
  ```

  The output is data, not generated functions. Catalog modules stay plain object literals, there is nothing to `eval`, and they are Worker-safe (hard rules 5 and 6) if a Worker ever renders a catalog (e.g. a visitor-facing notice).
- **Runtime** (`@cloudhal/messages/format`, about 1 kB minified, estimated): `formatMessage(locale, message, params)` walks the data. `Intl.PluralRules(locale, {type})` and `Intl.NumberFormat(locale, options)` are created once per locale and options and kept in a module-level `Map`. That is at most 3 languages × a few option sets, so there is no eviction. `translate()` calls it; nothing else in Studio changes.
- **Bundle.** The entry gains the formatter (about 1 kB, estimated). Catalogs shrink slightly, because each `…One` key disappears into its sibling. No parser is in any chunk: `bundle-budget.ts` gets a `LAZY_ONLY`-style "never anywhere" rule for `packages/messages/src/compile.ts`. A runtime-parse alternative would add a full message parser to the first load; FormatJS documents precompiling messages precisely to drop that parser from bundles ([FormatJS][formatjs-precompile]). The only advantage would be not needing a plugin.

### 3. Typing: parameters per key, generated from English
- `pnpm --filter @cloudhal/studio i18n:types` (also run by `pnpm gen`) writes `apps/studio/src/i18n/generated/params.ts` from the English catalogs. It is generated, committed and never edited (hard rule 1); `pnpm drift` catches staleness.

  ```ts
  export interface MessageParams {
    "editor.words": { count: number };
    "menus.delta.add": { label: string; where: string; place: string; below: number };
    "comments.bulk.notFor": { action: "approve" | "hide" | "spam" | "restore" };
    "gating.abilities.rollback": { roles: string; role: string }; // forms, section 4c
    // keys without arguments are absent
  }
  ```

  Argument kinds give types:
  - `plural`, `selectordinal` and `number` give `number`;
  - `select` gives the union of its explicit keys (`other` stays as the runtime safety net, not a type);
  - a simple `{x}` gives `string | number`.

  Type-level parsing of 4,654 `as const` literals was considered and rejected. Nested braces need recursive template-literal types, which hit TypeScript's recursion limits on long messages and slow every editor keystroke. Codegen also matches how the repo already handles contracts.
- **`t()` and `TFunction`**, keys unchanged:

  ```ts
  type Args<K> = K extends keyof MessageParams ? [params: MessageParams[K]] : [params?: undefined];
  export type TFunction<N extends Namespace = never> = <K extends KeyIn<N>>(key: K, ...args: Args<K>) => string;
  ```

  A missing, misspelled or wrongly typed argument becomes a compile error, and so does an extra one (object-literal excess checks). A template key (``t(`roles.names.${role}`)``, 24% of calls) is a union. Its arguments are the intersection of its members' parameters, so every possible key is satisfied. `translate()` keeps a loosely typed overload for the few places that build keys at runtime.
- Lazy namespaces, `useT("<ns>")`, `KeyIn<N>`, `withMessages` and the locale registry stay as they are. Non-English catalogs keep their types (`Messages`, `NamespaceMessages<…>` as `DeepString`). Their parameters are checked against English by the tests in section 5, not by types, so a translation can restructure a sentence freely.

### 4. Migration of the existing work-arounds
Each step is one PR. Tooling lives in `scripts/i18n-codemod/`. Every step runs the checks of section 5, the full Studio tests and the bundle budget.

- **a. Runtime and compiler, no catalog changes.** All existing strings are valid ICU, except the 3 literal-brace strings, which this step quotes. Behaviour is identical.
- **b. Plural pairs (46).** A codemod over the English and every language's catalogs finds sibling keys `xOne` with `x`, `xOther` or `xMany`. It writes:

  ```
  x: "{count, plural, one {<One text, literal 1 → #>} other {<other text, {count} → #>}}"
  ```

  and deletes `xOne`.
  - For each other locale it builds the branches from that locale's two strings. The `few`/`many` categories it lacks are only needed by languages that do not exist yet; tr and de have one/other ([CLDR][cldr-plurals]).
  - An AST rewrite of the call sites (oxc through Vite's `parseAst`, as the i18n lint does) turns `n === 1 ? t(kOne) : t(k, { count: n })` and `plural(t, k, kOne, n, p)` into `t(k, { count: n, ...p })`.
  - `…One` texts that are not just "1 …" become an exact `=1` branch (`hideTitleOne: "Hide this comment"` → `=1 {Hide this comment}`).
  - Sites that do not match the pattern are listed for hand review. Known ones: `comments.agentRequests.titleOne/titleMany` (one agent vs several, not only the number), `menus.depthOne/depthMany` keyed on `i === 0`, the `titleOne: { page, contentEntry }` objects that become `select` + `plural`, and `schedule-notices.ts`'s `` `${n}.conflict.titleOne` ``.
  - Then the `plural()` helper is deleted.
- **c. Alternative forms (`role`/`roles`, `plural`/`Plural`/`singular`/`Singular`).** These are forms of data (a role's name, a taxonomy's own labels), not choices a `select` can list. The English message declares the forms its call site passes, in a sidecar of the catalog:

  ```ts
  // en.ts
  export const forms = {
    "gating.abilities.*": ["roles", "role"],
    "taxonomy.*": ["plural", "Plural", "singular", "Singular"],
  } as const;
  ```

  The type generator adds the declared forms to those keys' parameters. The parity check accepts any declared form, which replaces `ALTERNATES` in `test/i18n.test.tsx`. This is MF1's version of MF2's `.input` declarations.
- **d. Dropped and injected words.** Of the 45 tr mismatches, 41 are forms (step c: 34 `gating.abilities.*`, 7 `taxonomy.*`). The other 4 are these:
  - `comments.bulk.notFor` ("…can be {action}", with a translated participle from `comments.actions.past.*`) and `comments.results.done` become `{action, select, approve {…} hide {…} … other {…}}` with whole sentences per language. The `past.*` composition goes.
  - `menus.delete.title` and the two `common.deleteResource.*` drops stay as declared drops. Turkish cannot attach a case suffix to an arbitrary name. The per-locale `DROPPED` list moves from the test into the catalog sidecar, with a reason per key.
- **e. Fragments.**
  - `menus.delta.withBelowOne`/`withBelow` become a nested plural in `menus.delta.add` (`{below, plural, =0 {} one {, with 1 item below it} other {, with # items below it}}`). Likewise `removeTreeOne`.
  - JSX stitches such as `agents.modes.waitsLabel` + `waits.${mode}` become one `select` message.
  - `` `${t(a)} ${t(b)}` `` becomes one message with both parts.
  - The lint (section 5) lists the rest.
- **f. Lists (35 `.join(", ")`).** These are not message syntax. Each site passes a string formatted by the Phase 2 helper `formatList(locale, items, { type: "conjunction" | "unit" })` (`Intl.ListFormat`). Each site is reviewed by hand: some are data echoes (slugs, scopes) that keep a `unit` list.

Rollback for each step is a revert. Steps b–e are catalog plus call-site changes with no stored data, and the runtime from step a accepts both shapes.

### 5. Checks
Extend `test/i18n.test.tsx` (which already runs per registered language) and the i18n lint:
1. **Syntax.** Every string of every catalog compiles; the failure names the key, locale and column.
2. **Argument parity.** Each translation uses only arguments that English declares (including declared forms). An argument used as `plural`/`selectordinal`/`number` in English may be `plural`, `selectordinal`, `number` or `{n}` in a translation. Turkish `{count} dosya` needs no plural, because Turkish nouns are not pluralised after numerals. A `select` argument must stay a `select` (printing its raw value would show an enum). Every English argument appears in the translation unless the key is a declared drop.
3. **Plural completeness.** Every `plural` in locale L has a branch for every category of `new Intl.PluralRules(L).resolvedOptions().pluralCategories`, and `selectordinal` the ordinal ones ([MDN][mdn-plural]). An exact `=n` does not replace a category. `other` always exists.
4. **Select coverage.** A translation's `select` lists the same keys as English (plus `other`).
5. **No plural by hand.** The test fails on any key matching `/(One|Many)$/` once step b lands. The i18n lint (`apps/studio/scripts/i18n-lint.ts`) gains rule `i18n-plural`: a conditional whose test compares a number with `0`/`1`/`length` and whose branches both call `t()` means "use a plural message". Rule `i18n-concat` flags `t()` results joined by `+`, template literals or `.join(", ")`; the fix is "one message, or `formatList`". Both run in `pnpm check`, `pnpm design:lint` and the agent hook, and use the documented `i18n-ignore: <reason>` for exceptions.
6. **Pseudo-locale.** It is out of scope (report Phase 5), but the compiler makes it trivial: transform text parts, keep syntax.

### 6. Writing a plural message (contributors and agents)
English (`en.ts`): one key with the number as an argument, never a ternary.

```ts
words: "{count, plural, one {# word} other {# words}}",
pendingTitle: "{count, plural, =0 {No comments wait} one {# comment waits} other {# comments wait}} for moderation",
```

```tsx
<Text>{t("editor.words", { count })}</Text>   // count: number, checked by the type
```

The same key in other languages, one string each:

```ts
// tr: Turkish nouns stay singular after a number; one/other exist in CLDR but read the same
words: "{count, number} kelime",
// de
words: "{count, plural, one {# Wort} other {# Wörter}}",
// ru: four categories; 1 слово, 3 слова, 5 слов, 1,5 слова
words: "{count, plural, one {# слово} few {# слова} many {# слов} other {# слова}}",
// ar: six categories; zero, one, two, 3–10, 11–99, 100+
words: "{count, plural, zero {لا كلمات} one {كلمة واحدة} two {كلمتان} few {# كلمات} many {# كلمةً} other {# كلمة}}",
```

The Russian and Arabic strings are why the categories matter. A `one`/`other` pair would print "21 слов" and "3 كلمة" — both wrong. With the check in section 5.3, a Russian catalog that forgets `few` fails `pnpm check` before review. DESIGN.md §1 gets this section, and the studio-ui skill gets one line: "counts are `plural` messages; choices of a fixed set are `select`; lists go through `formatList`."

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep `…One/…Other` key pairs (today) | No new code | Encodes English's two forms. Wrong for ru/uk/pl/ar ([CLDR][cldr-plurals]). Doubles keys and ternaries at every count. | Blocks every language beyond one/other. |
| Key suffixes per category (i18next JSON v4: `key_one`, `key_few`, …) ([i18next][i18next-plurals]) | Simple strings; widely supported | One key per category per language. Keys differ between languages, so typing keys from English breaks. No `select` or nesting. | Multiplies keys; fights keys-in-code typing. |
| FormatJS / react-intl ([docs][formatjs], [precompile][formatjs-precompile]) | ICU MF1 done right; mature; AST precompile exists | Replaces our provider, typed `t()`, lazy namespaces and `withMessages`. Ids are not typed per namespace. Larger runtime (`intl-messageformat`) even precompiled. | We keep our loading model and types, and need only its syntax, which we adopt. |
| Lingui ([docs][lingui]) | Compiled ICU, ~2 kB runtime, PO tooling | Source-text ids and Babel/SWC macros. Rewrites 4,546 call sites. Macro support for Vite 8 + Rolldown is unverified. | Keys in code stay (review §2.3); macros are a toolchain bet. |
| i18next + ICU plugin ([docs][i18next]) | Namespaces and backends close to ours | ICU only through a plugin that bundles a runtime parser. Types via module augmentation. A large runtime. | No gain over our runtime; adds weight to the first load. |
| Paraglide JS 2 ([docs][paraglide]) | Compile-time functions, tree-shaken, typed | Every call site becomes `m.key()`. Messages are compiled to functions. Whole-locale lazy loading is not its model; `setLocale` reloads the page by default. | Would replace lazy namespaces and the registry; more churn than value. |
| Wait for MF2 / `Intl.MessageFormat` ([proposal][tc39-mf], [spec][mf2]) | One standard, native in browsers eventually | Stage 1. The JS implementation is a prerelease ([npm][mf2-npm]). Translation platforms do not document MF2 yet. Russian and Arabic stay blocked meanwhile. | The compiled data model (section 2) makes the later move a parser swap. |
| Runtime ICU parse (`intl-messageformat` in the browser) | No build plugin | A message parser in the first load. Parse cost at each first use. Errors only show when a message renders. | Build-time compile is cheaper, fails earlier and is Worker-safe. |

## Compatibility & migration
- No contract or schema change; no `schemaVersion` impact; no stored data. Catalogs are source.
- Rollout follows section 4, steps a–f, one PR each, with tests, the bundle budget and `pnpm design:lint` green at every step. Run tests one package at a time.
- Rollback: revert the step. The step-a runtime formats both old and new shapes.
- The translation platform (report Phase 4) exports these strings as ICU MF1, the format the four candidates read.
- Effort, estimated: step a 2–3 days, b 1–2, c–e 2, f 1–2, plus checks 1. That matches the report's Phase 1 (3–5 days) plus the lists from Phase 2.

## Security & policy impact
- No new scopes, approval points or tenant data.
- Messages are compiled to data, not functions: no `eval` or `new Function` (AGENTS.md hard rule 6), so they are safe to load in a Worker.
- Parameters are inserted as text into React text nodes, never as HTML (unchanged). A `select` on an untrusted value falls back to `other` and never prints markup.

## ADR
On acceptance, ADR "Studio messages: ICU MF1 subset, compiled to data" records:
- the syntax subset;
- build-time compilation;
- the `@cloudhal/messages` package boundary (Worker-safe runtime; compiler build-only);
- the generated parameter types;
- the MF2 path.

## Open questions
1. **MF2 in translation platforms.** Crowdin, Weblate, Tolgee and Lokalise document ICU MF1; we found no MF2 import/export documentation (2026-10). Check again before Phase 4 picks a platform.
2. **Package location.** Is `@cloudhal/messages` worth a new private package, or should it be `@cloudhal/core-ts/messages`? A package keeps the compiler out of core-ts's dependency graph; a subpath avoids a new `package.json`.
3. **`{x}` inside plural branches.** Should `{count}` inside a plural branch be allowed in addition to `#`? It is allowed here because translators use it; the lint could prefer `#`.
4. **Turkish `forms`.** Should declared forms (section 4c) eventually be replaced by passing the entity (a role key) and letting a shared "terms" catalog inflect it? That would be MF2's custom functions; out of scope here.

[cldr-plurals]: https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html
[cldr47]: https://cldr.unicode.org/downloads/cldr-47
[mf2]: https://messageformat.unicode.org/
[mf2-npm]: https://npmjs.com/package/messageformat
[tc39-mf]: https://github.com/tc39/proposal-intl-messageformat
[icu-mf]: https://unicode-org.github.io/icu/userguide/format_parse/messages/
[mdn-plural]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules
[i18next]: https://www.i18next.com/
[i18next-plurals]: https://www.i18next.com/translation-function/plurals
[formatjs]: https://formatjs.github.io/docs/react-intl/
[formatjs-precompile]: https://formatjs.github.io/docs/guides/advanced-usage
[lingui]: https://lingui.dev/introduction
[paraglide]: https://paraglidejs.com/
