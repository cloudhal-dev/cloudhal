# ADR-0032: Studio messages are an ICU MessageFormat 1 subset, compiled to data at build time
- Status: Accepted
- Date: 2026-10-18
- Related: RFC-0032, DESIGN.md §1, an internal review (2026-10)
- Sources:
  - CLDR plural rules: https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html
  - ICU MessageFormat: https://unicode-org.github.io/icu/userguide/format_parse/messages/
  - MessageFormat 2 (stable since CLDR 47): https://messageformat.unicode.org/, https://cldr.unicode.org/downloads/cldr-47
  - `Intl.MessageFormat` (TC39 Stage 1): https://github.com/tc39/proposal-intl-messageformat
  - `Intl.PluralRules`: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules

## Context
Studio's catalogs knew only `{name}` substitution. English's two plural forms were coded by hand (46 `…One` key pairs, 26 count ternaries), and grammar was handled by passing several forms of a word. Languages with more plural categories (ru, uk, pl: four; ar: six) could not be added correctly.

## Decision
1. **Syntax.** A catalog value is a string in an ICU MessageFormat 1 subset:
   - `{name}`;
   - `{n, number[, integer|percent|compact]}`;
   - `{n, plural, =k {…} <cldr category> {…} other {…}}`, where both `#` and `{n}` inside a branch are allowed;
   - `{n, selectordinal, …}`;
   - `{k, select, … other {…}}`.

   `other` is required. There are no date or time arguments and no `offset`. Quoting follows ICU's "double optional" apostrophe mode.
2. **Compiled to data at build time.** The private, dependency-free package `@cloudhal/messages` holds:
   - a build-only compiler (`./compile`);
   - a Worker-safe runtime formatter (`./format`).

   A Vite plugin compiles catalog modules in dev, build and Vitest. Messages with only `{name}` arguments stay strings; others become JSON data. No parser ships, nothing is evaluated, and `Intl.PluralRules`/`Intl.NumberFormat` are cached per locale and options.
3. **Types.** The parameter types per key are generated from the English catalogs into a committed file (`pnpm gen`, checked by `pnpm drift`), and `t()` checks the arguments against them. Keys stay in code, and lazy namespaces and the locale registry are unchanged.
4. **Checks.** Every catalog compiles. Arguments in translations are a kind-compatible subset of English's (with declared forms and drops). Every CLDR plural category of the locale is present.
5. **MessageFormat 2 later.** The compiled data model mirrors MF2's selectors and variants, so moving to MF2 syntax or `Intl.MessageFormat` changes the parser and the catalogs (by codemod), not call sites.

## Alternatives considered
| Alternative | Pros | Cons | Why not |
|---|---|---|---|
| Keep `…One/…Other` pairs | No code | Wrong for ru/uk/pl/ar; doubles keys | Blocks languages |
| FormatJS / Lingui / i18next / Paraglide | Mature | Each replaces our typed `t()`, loading or ids | We need the syntax, not a framework |
| Parse ICU at runtime | No plugin | A parser in the first load; errors at render | Build-time is cheaper and fails earlier |
| MF2 syntax now | Future standard | Stage 1 in TC39; the JS implementation is a prerelease; translation platforms don't document MF2 | The data model keeps the path open |

## Consequences
- Positive:
  - plurals are correct for every CLDR language;
  - `t()` argument errors are caught at compile time;
  - no parser in any bundle;
  - translators work in the industry-standard format.
- Negative:
  - a build plugin and a generated file to keep in step;
  - non-English catalogs are checked by tests, not by types.
- Risks:
  - a Vite or Vitest path that skips the plugin would hand raw ICU to the runtime. The runtime treats unknown shapes as plain strings, and a test asserts the compiled shape.
