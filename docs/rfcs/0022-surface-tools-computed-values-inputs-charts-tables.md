# RFC-0022: Surface tools — computed values, inputs, charts and tables
- Status: Draft
- Author: Halil (Madraka), drafted with Claude · Date: 2026-10-16
- Related:
  - RFC-0020 (surfaces: catalog, bindings, the interaction runtime, body fences, interop), RFC-0021 (DESIGN.md, `render_page`, the design pass and eval);
  - `docs/design/agent-built-sites-gap-analysis.md` (G4 components, G7 interactivity);
  - ADR-0030 (block registry), the surface contract (`common.schema.json#/$defs/SurfaceComponent`).
- References (checked 2026-10-16):
  - A2UI v0.9 components (TextField, CheckBox, ChoicePicker, DateTimeInput, Slider): https://a2ui.org/specification/v0.9-a2ui/
  - json-render (catalogs, actions, data bindings): https://json-render.dev
  - WCAG 2.2: 1.3.1 Info and Relationships, 3.3.2 Labels or Instructions, 1.4.11 Non-text Contrast.

## Summary
Surfaces can show, switch and reveal, but they cannot compute, take a typed value or draw data. This RFC adds four things to the catalog:
- **Computed values:** arithmetic, choice and aggregate functions in the existing `{call, args}` shape, plus a safe `calculate` for typed expressions.
- **Local inputs:** `NumberField`, `TextField`, `Checkbox`, `RadioGroup`.
- **A `Chart` component,** rendered as SVG on the server.
- **A `Table` component.**

Everything stays data, never code: nothing a model writes is evaluated, inputs never leave the reader's browser, and every surface still renders complete without JavaScript. With these, agents can build calculators (calories, loans, pricing), comparison tables and charts inside articles live, and the eval can measure it.

## Motivation
- **What people ask for.** "A calorie calculator", "a mini calculator", "a chart of this year's numbers in the article", "a plan comparison". None of these can be built today.
  - The functions are formatting and validation only (`formatDate`, `formatNumber`, `formatCurrency`, `pluralize`, `concat`, `length`, `required`, `minLength`, `maxLength`, `email`, `range`).
  - The only inputs are `Toggle`, `Select` and `Slider`.
  - There is no chart and no table; an external `embed` is the only way to show a chart.
- **The eval shows the gap.** In RFC-0021's design evals, gpt-oss-120b built a pricing section with a seats slider and wrote "Total will be calculated based on seats", because nothing could multiply. The judge marked it down for it.
- **Interop drops inputs.** `surface-interop.ts` refuses A2UI's TextField, CheckBox and DateTimeInput ("need server actions"). They don't: when they write only to the surface's own data, they are local state like `Slider`.
- **Competitors.**
  - Code generators (v0, Lovable, Bolt) can build any of these, at the cost of code that agents cannot edit safely and people cannot review.
  - A2UI and json-render already have text and choice inputs.
  - Closing this gap, while keeping surfaces data, is what makes Cloudhal's generative UI a tool builder and not only a landing page builder.
- **Why now.** RFC-0021 gave agents sight (`render_page`), design rules and a calibrated judge, so new vocabulary can be measured as it lands.

## Proposal

### 1. Computed values
New names in `SURFACE_FUNCTIONS`, in the same shape as today: `{"call": "<name>", "args": {…}}`. Any argument may be a literal, a `{path}` binding or another call, so calls nest.

| Function | Args | Result |
|---|---|---|
| `add` | `values: [n…]` | sum |
| `subtract` | `a`, `b` | a − b |
| `multiply` | `values: [n…]` | product |
| `divide` | `a`, `b`, `fallback?` | a ÷ b; `fallback` (default `""`) when b is 0 |
| `round` / `floor` / `ceil` | `value`, `digits?` (0–6) | rounded |
| `abs` | `value` | absolute value |
| `min` / `max` | `values: [n…]` | smallest / largest |
| `clamp` | `value`, `min`, `max` | value kept within |
| `power` | `base`, `exponent` (at most ±1000) | base to the exponent (added in 22e for loan payments) |
| `number` | `value`, `fallback?` | a typed string as a number |
| `if` | `cond` (a `visible` condition), `ifTrue`, `ifFalse` | one of two values (not `then`/`else`: an object with a `then` key is treated as a promise by `await`) |
| `choose` | `value`, `cases: {key: v}`, `default?` | the case for a key (a select's choice → a factor) |
| `sum` / `average` / `count` | `list`, `field?` | an aggregate over an array in the data |
| `formatPercent` | `value`, `digits?` | `0.25` → "25%" in the page locale |
| `calculate` | `expression` (string, ≤ 200 characters) | a typed arithmetic expression's value (§1.1) |

**Semantics:**
- **Pure and deterministic:** no time, randomness or I/O.
- **Numbers are finite doubles.** A result that isn't finite (NaN, ±Infinity) becomes `""`, which renders as empty. Results are rounded to 10 significant digits before display, so `0.1 + 0.2` shows 0.3.
- **Text in, number out:** text arguments are coerced with `Number()`. A blank input is not 0; it propagates `""`, so a result stays empty until its inputs are filled.
- **Limits** (the checks refuse a surface over them; the runtime stops evaluating past them):
  - nesting at most 8 deep;
  - at most 500 calls per evaluation of a surface;
  - lists of at most 1,000 items for aggregates.
- **Conditions** gain `gte` and `lte`, next to `eq`, `ne`, `gt` and `lt`.

**Where it runs.** The same function table runs in `resolveValue` (server render and previews) and in the interaction runtime. A test keeps the two equal, as it does today. The runtime file gets a new version (`/_cloudhal/surface.2.js`). Pages already cached keep `surface.1.js`, which stays served.

#### 1.1 `calculate`
This is for keypad calculators, where the reader types an expression. The grammar:

```
expr   := term (("+" | "-") term)*
term   := factor (("*" | "/" | "%") factor)*
factor := ("-")? (number | "(" expr ")")
number := digits ("." digits)?
```

- **Parsing:** a recursive-descent parser of about 40 lines, shared by the server and the runtime. There is no `eval`, `Function` or `with`.
- **Input:** `×` and `÷` are accepted as `*` and `/`. Anything outside the grammar returns `""`.
- **Limits:** depth at most 32.
- **Result:** a number, with the same finiteness and rounding rules as above.

#### 1.2 Example: a calorie calculator (the Mifflin–St Jeor equation)

```json
{"id":"sec_calories01","kind":"surface","catalog":"blog@1",
 "data":{"sex":"female","age":"","height":"","weight":"","activity":"light"},
 "components":[
  {"id":"root","component":"Card","children":["title","sex","fields","activity","result"]},
  {"id":"title","component":"Heading","props":{"text":"Daily calories","level":2}},
  {"id":"sex","component":"RadioGroup","props":{"label":"Sex","value":{"path":"/sex"},"variant":"buttons",
    "options":[{"value":"female","label":"Female"},{"value":"male","label":"Male"}]}},
  {"id":"fields","component":"Grid","props":{"columns":3,"gap":"m"},"children":["age","height","weight"]},
  {"id":"age","component":"NumberField","props":{"label":"Age","value":{"path":"/age"},"min":15,"max":100,"unit":"years"}},
  {"id":"height","component":"NumberField","props":{"label":"Height","value":{"path":"/height"},"min":120,"max":230,"unit":"cm"}},
  {"id":"weight","component":"NumberField","props":{"label":"Weight","value":{"path":"/weight"},"min":30,"max":250,"unit":"kg"}},
  {"id":"activity","component":"RadioGroup","props":{"label":"Activity","value":{"path":"/activity"},"variant":"buttons",
    "options":[{"value":"low","label":"Low"},{"value":"light","label":"Light"},{"value":"high","label":"High"}]}},
  {"id":"result","component":"Stat","props":{"label":"Calories a day",
    "value":{"call":"formatNumber","args":{"digits":0,"value":{"call":"multiply","args":{"values":[
      {"call":"add","args":{"values":[
        {"call":"multiply","args":{"values":[10,{"path":"/weight"}]}},
        {"call":"multiply","args":{"values":[6.25,{"path":"/height"}]}},
        {"call":"multiply","args":{"values":[-5,{"path":"/age"}]}},
        {"call":"choose","args":{"value":{"path":"/sex"},"cases":{"male":5,"female":-161}}}]}},
      {"call":"choose","args":{"value":{"path":"/activity"},"cases":{"low":1.2,"light":1.375,"high":1.725}}}]}}}}}}
 ]}
```

### 2. Local inputs
Inputs write to the surface's own data model (`value: {"path": …}`). That model lives in the reader's browser: nothing is submitted, stored, sent to analytics or read by the server. Forms that send data are a separate future RFC (G9).

| Component | Props | Notes |
|---|---|---|
| `NumberField` | `label` (required), `value` (binding, required), `min`, `max`, `step`, `unit`, `placeholder`, `help` | `<input type="number" inputmode="decimal">`; the unit is shown as a suffix |
| `TextField` | `label` (required), `value` (binding, required), `placeholder`, `maxLength` (≤ 500), `kind: text\|email`, `help` | single line |
| `Checkbox` | `label` (required), `checked` (binding, required) | |
| `RadioGroup` | `label` (required), `value` (binding, required), `options: [{value, label}]` (2–8), `variant: list\|buttons` | `buttons` is a segmented control |

- **Server render:** each input is rendered with the data's initial value, with a real `<label>` and the `help` text linked by `aria-describedby`. The server writes the HTML; the runtime keeps it live (`data-ch-model`), as for `Slider` today.
- **Without JavaScript:** the fields show but don't recompute. A short note that the calculator needs JavaScript shows only then (`<noscript>`).
- **Validation:** the existing validators (`required`, `range`, `minLength`, `email`) can drive an `invalid` prop (a binding) that marks the field and shows its `help` as the error.
- **Interop:** A2UI TextField, CheckBox and ChoicePicker bound to local data convert to these components, and back. DateTimeInput stays refused (no date input in this RFC).
- **Keypad calculators:** these need one new action, `append {path, value}`. It adds text to a string value, capped at 200 characters. With `set`, `reset` and `calculate`, a mini calculator is about 20 components.

### 3. `Chart`
`Chart` (content, no children) has these props:
- `kind`: `bar | line | area | donut`;
- `title` (required; the chart's accessible name);
- `data`: an array of objects, as a binding or a literal;
- `x`: the field holding categories or dates;
- `series`: `[{field, label}]`, 1–6 entries;
- optional: `unit`, `stacked`, `height: s|m|l`, `caption`.

- **Rendering:** the astro-renderer draws it on the server as inline SVG, with no chart library. Axes, gridlines, labels and a legend are computed from the data, and colors come from the theme's tokens (`--ch-chart-1…6`, derived from the brand color with WCAG non-text contrast of at least 3:1 against the surface).
- **Accessibility:** a `<figure>` with the title, the SVG (`role="img"`, `aria-labelledby`), the caption, and the same data as a `<table>` in a `<details>`. Screen readers and feed readers that drop SVG still get the numbers.
- **Live data:** when the bound data changes (inputs, buttons), the runtime redraws the chart. The SVG builder is one shared module, used by the server and a lazily loaded `/_cloudhal/chart.1.js`; it loads only on surfaces whose chart is bound to changing data.
- **Limits:** at most 500 points per chart and 6 series. Labels are text, escaped.
- **Everywhere surfaces go:** pages, article bodies (fences), previews, `render_page` and feeds (in feeds the table shows, without the SVG).

### 4. `Table`
`Table` (content, no children) has these props:
- `caption` (required; the table's accessible name);
- `rows`: an array of objects, as a binding or a literal, at most 200;
- `columns`: `[{field, label, align: start|end, format?}]`, 1–8; `format` is a call applied to each cell, e.g. `formatCurrency`;
- optional: `striped`, `highlight` (a `visible`-style condition per row, for "the recommended plan").

- **HTML:** a real `<table>` with `<caption>` and `<th scope>`.
- **Small screens:** each row becomes a stacked card below 480 px; there is no sideways scroll. `render_page`'s `overflow-x` check must pass.

### 5. Catalog, prompt and design guidance
- **Additive within `blog@1`:** existing surfaces are unchanged. Themes may leave out any of the new components (`omit`), and their DESIGN.md says which they style.
- **`catalogPrompt`** lists the new functions and components with short examples (the calculator above, compressed), and teaches "compute, don't promise": never write "calculated at checkout" for something a surface can compute.
- **`DESIGN_GUIDANCE`** point 6 grows: inputs only where a reader decides something, always labelled, with a visible result next to them; a chart only when the numbers are the point, never decoration.
- **The `site-design` skill** gains recipes: calculator, comparison table, chart in an article, and a keypad calculator.

### 6. The agent loop
- **New `render_page` checks:**
  - `input-label`: an input without a visible label;
  - `chart-empty`: a chart with no data points;
  - `computed-empty`: a `Stat` or `Text` bound to a call that is empty with every input filled from its `min`.
- **New Build eval briefs:**
  - `calories`: the calculator above, from a one-sentence brief;
  - `loan`: a loan payment calculator, with a monthly payment from amount, rate and years;
  - `chart-article`: an article whose body holds a bar chart of six months of numbers;
  - `compare`: a plan comparison table with the recommended row highlighted.
- **The judge rubric:** "fidelity" now covers whether the tool works. The design pass renders it with sample inputs filled (each `NumberField` gets its `min`, and an extra screenshot is taken after the first input is set).

### Invariants
1. Nothing a model writes is evaluated as code. Functions are Cloudhal's fixed set; `calculate` is a grammar, not `eval`.
2. Functions are pure and deterministic, and give the same result on the server and in the runtime (tested).
3. Input values never leave the reader's browser.
4. Every surface renders complete and readable without JavaScript. Charts and tables carry their data as HTML.
5. Every input, chart and table has an accessible name (a required `label`, `title` or `caption`).
6. Limits (call depth and count, list size, chart points, table rows) are enforced by the store's checks and by the runtime.
7. The JSON Schema contract does not change: `props` stay free-form, validated by the catalog.

## Alternatives considered
| Option | Pros | Cons | Why not |
|---|---|---|---|
| A JS sandbox (QuickJS in WebAssembly) running model-written code | Anything is possible | About 1 MB of runtime; code agents can't patch safely or people review; a new attack surface; breaks "data, not code" | It gives up the property that makes surfaces reviewable and approvable |
| An expression mini-language in strings (`"{{weight*10+6.25*height}}"`) everywhere | Short to write | A second syntax next to `{call}`; harder to check and repair per argument; models mix it up with JS | `{call}` already nests; `calculate` covers typed expressions only |
| Sandboxed `<iframe srcdoc>` with model HTML and JS (v0-style widgets) | Fast to ship | Inconsistent with the theme; inaccessible by default; CSP exceptions; nothing to check | It throws away the catalog, the checks and DESIGN.md |
| A chart library (ECharts, Chart.js) on the site | Rich charts | 100–300 KB of JS per page; nothing without JS; theme mismatch | Server SVG covers bar, line, area and donut at a fraction of the weight, and works in feeds and previews |
| Inputs that submit to the server now | Real forms | Spam, storage, consent and moderation: its own design | Local inputs first; forms in their own RFC (G9) |

## Compatibility & migration
- **No `schemaVersion` change; no JSON Schema or Rust change** (props are free-form).
- **The catalog grows within `blog@1`;** old surfaces render the same.
- **Runtime:** `surface.2.js` is new; `surface.1.js` stays for cached pages. A surface with any new function or component loads `surface.2.js`.
- **Themes:** `starters/blog` styles the new components. Other themes see them unstyled-but-usable until they style them, or omit them.
- **Rollback:** removing a component makes surfaces that use it render it as an unknown component (labelled in previews, left out on the site), as for any unknown block today. Functions removed later render `""`.

## Security & policy impact
- **No new scopes.** Building tools is a content change (`content:write`), reviewed and published like any draft.
- **No code execution.** `calculate` accepts digits, operators, parentheses and a decimal point. Everything else is `""`.
- **Bounded cost:** call, depth, list, point and row limits; the runtime stops evaluating past them, so a hostile surface cannot hang a reader's tab.
- **Inputs are local.** No network access, no storage by default, no analytics on values. DESIGN guidance says not to ask for data a tool doesn't need.
- **Output:** text goes in as `textContent`; SVG is built from numbers and escaped labels only.

## Rollout
| Phase | Scope |
|---|---|
| 22a | Functions (§1, `calculate`, `gte`/`lte`), checks and limits, runtime v2, catalog prompt, interop for computed props |
| 22b | Inputs (§2), the `append` action, interop for A2UI inputs, the `input-label` check |
| 22c | `Chart` (§3): the shared SVG builder, server render, lazy runtime redraw, theme chart tokens, the `chart-empty` check |
| 22d | `Table` (§4) |
| 22e | Eval briefs, skill recipes, DESIGN guidance, the design pass with sample inputs; an eval run recorded here |

### Status
- **22a shipped.**
  - **Functions.** The 19 functions of §1 are in `SURFACE_FUNCTIONS`, with `calculateExpression` (the §1.1 grammar). `resolveValue` runs `if` and `choose` against the data and returns `""` past 8 levels of nesting.
  - **Checks.** A call's arguments may be calls (at most 8 deep), `choose.cases` a map (at most 20 keys) and `if.cond` a condition. A surface holds at most 500 calls, `calculate` at most 200 characters, and conditions add `gte`/`lte`.
  - **The interaction runtime** carries the same table (a parity test over 32 values and 6 conditions) as `/_cloudhal/surface.2.js`. The same code is also served as `surface.1.js` for cached pages (`SURFACE_SCRIPT_ALIASES`).
  - **The catalog prompt** teaches "compute, don't promise", the argument shapes and a seats × price example.
  - **Interop.** json-render's `gte`/`lte` now map to the new conditions; A2UI has no arithmetic, so exporting a computed value leaves it out with a note.
- **22b shipped.**
  - **Inputs.** `NumberField`, `TextField`, `Checkbox` and `RadioGroup` are primitives (`INPUT_MODEL`). Their value (`checked` for Checkbox) must be a `{path}` binding, which the checks enforce. Each renders with a real `<label>` or `<fieldset>`/`<legend>`, its `help` linked by `aria-describedby`, and an `invalid` state the runtime keeps in step when it is bound or computed.
  - **Without JavaScript,** a live surface with fields says, in the page's language, that the tool needs JavaScript (`<noscript>`).
  - **Actions.** `append` adds text to a value (at most 20 characters a click, 200 in all). `set` may write a computed value, so `=` on a keypad is `set` with `calculate`.
  - **The runtime** writes check boxes as true/false and leaves an empty number field `""`, never 0. It is now `/_cloudhal/surface.3.js`, with 1 and 2 served as aliases.
  - **Interop.** A2UI TextField (`number` → NumberField) and CheckBox convert, with literal values moved into the data; password and date fields are refused with a note. The export maps the four inputs to TextField, CheckBox and ChoicePicker.
  - **`render_page`** checks `input-label`: a form control without an accessible name. Studio names it in the chat.
  - **Styles** in the blog theme (synced to the examples) and the preview. DESIGN guidance point 6 and the theme's DESIGN.md say how to lay out a tool.
- **22c shipped.**
  - **`Chart`** (bar, grouped or stacked; line; area; donut) is a primitive. Its `data` must be a `{path}` binding to a list of rows.
  - **Drawing.** `chartInner` (astro-renderer `chart.ts`) draws it as SVG with nice ticks, at most 12 axis labels and a tooltip per point. A legend appears for several series or a donut, and the same numbers sit in a `<table>` under "Show the data" (localized). Every text is escaped; numbers are formatted in the page locale with the unit.
  - **Live charts.** The same self-contained function ships as `/_cloudhal/chart.1.js`. The runtime (`surface.4.js`; 1–3 served as aliases) loads it only when a live surface has a chart, and redraws it from its bindings when the data changes. A test checks the browser copy draws exactly what the server does; under Node's own type stripping it was checked to be valid and identical too, with no bundler `__name` helpers.
  - **Colors** are theme tokens `--ch-chart-1…6`: the brand color first, then five fixed hues that each reach 3:1 against white.
  - **`render_page`** checks `chart-empty`; Studio names it. The catalog prompt, DESIGN guidance and the theme's DESIGN.md say when to use a chart and which kind.
- **22d shipped.**
  - **`Table`** is a primitive. `rows` must be a `{path}` binding; `columns` hold at most 8 fields with `label`, `align` and a `format` (text, number, currency with `currency`, percent, date, with `digits`); `highlight` marks a row where a field equals a value; `striped` is optional.
  - **Rendering.** A real `<table>` with `<caption>` and `<th scope="col">`. Cells are formatted in the page locale and escaped. Each cell carries `data-label`, so below 480 px the theme shows every row as a card of label–value pairs, with no sideways scroll.
  - **Checked in Chrome** with a calorie calculator, a bar chart and an 8-column table at 1440 and 390 px: no `overflow-x`. Two layout bugs found there were fixed: fields in one grid row now align when one has help text, and the caption no longer wraps narrow on phones.
- **Deviations (22d).**
  - **`format` is a named format,** not a function call per cell (props are flat objects in the catalog's schema subset). That is enough for the formats in §1.
  - **`highlight` compares one field with one value,** not a full condition.
  - **No live redraw:** tables render on the server only. A table bound to data that inputs change shows its first state; live tables wait for demand.
- **Deviations (22c).**
  - **Colors:** the six fixed hues stand in for a theme palette (open question 3) until tokens v2.
  - **Limits:** 500 rows per chart are drawn; the props check caps literal lists at 50, but chart data is always a binding.
- **Deviations (22b).**
  - **A bound or computed `Text`** in a live surface now renders as plain text the runtime keeps in step. Before, it was markdown rendered once, so a keypad display or a computed sentence never changed.
  - **ChoicePicker imports stay as they were** (Toggle or Select, whose options are their values). RadioGroup is used when exporting and when agents build.
- **Deviations (22a).**
  - **`if` takes `ifTrue`/`ifFalse`,** not `then`/`else`: an object with a `then` key is treated as a promise by `await`.
  - **Decimal commas.** Arithmetic reads `"2,5"` as 2.5, since readers type decimal commas in many locales.

## Open questions
1. **Reusable derived values.** Should a surface name derived values once (a `derive` map, read as `{"path": "/$derived/bmr"}`) instead of repeating nested calls? That would change `SurfaceSection` in the contract, so it may be its own small RFC after 22a shows how deep real calls get.
2. **Remembering inputs.** Should inputs keep their values across visits (`remember: true` in `localStorage`, per surface)? It is convenient but quietly stores what readers type.
3. **Chart colors.** Should chart colors come from a theme palette (tokens v2, G2) or be derived from the brand color as proposed?
4. **Units and locales.** Should `NumberField` convert units (cm/in, kg/lb) or leave that to `choose`?
5. **More chart kinds.** Scatter and stacked area: add them in 22c or wait for demand?
