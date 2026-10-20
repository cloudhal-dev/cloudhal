# @cloudhal/astro-renderer

## 0.2.0

### Minor Changes

- 82fa917: Four surface gaps found while building interactive articles (RFC-0022, after 22e).
  - **Computed comparisons:** a `visible` condition or `if`'s `cond` takes a call as an operand, e.g. `{"lt": [{"call": "calculate", …}, {"call": "calculate", …}]}`, within the same nesting and call limits. `evaluateCondition` takes an optional `ResolveContext`.
  - **`Toggle` label:** a labelled Toggle shows its label as a `<legend>`, as RadioGroup does.
  - **`Table` columns:** `hideOnPhone: true` keeps a column (never the first) out of the phone card.
  - **`formatNumber`:** `minDigits` keeps trailing zeros (9.60).
  - **Runtime:** it is now `surface.11.js`; the earlier names keep working.

### Patch Changes

- Updated dependencies [6612f2c]
- Updated dependencies [82fa917]
  - @cloudhal/core-ts@0.2.0
  - @cloudhal/comments@0.2.0
  - @cloudhal/analytics@0.2.0
  - @cloudhal/core-contracts@0.2.0
  - @cloudhal/storage@0.2.0

## 0.1.1

### Patch Changes

- @cloudhal/analytics@0.1.1
  - @cloudhal/comments@0.1.1
  - @cloudhal/core-contracts@0.1.1
  - @cloudhal/core-ts@0.1.1
  - @cloudhal/storage@0.1.1

## 0.1.0

Initial public release. See the [README](https://github.com/cloudhal-dev/cloudhal#readme) and the [docs](https://github.com/cloudhal-dev/cloudhal/tree/main/docs).
