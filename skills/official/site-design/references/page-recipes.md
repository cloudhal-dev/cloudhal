# Page recipes (today's catalog)

Starting points, not templates: adapt them to the site's rules and real content.

## Landing page
1. **Hero:** `Band` (tone `inverse` or `brand`, width `full`, spacing `xl`) → `Heading` level 1 (the promise, ≤ 8 words) → `Text` size `l` (one sentence) → `Row` with one primary and one secondary `Button`.
2. **Features:** plain section → `Heading` level 2 → `Grid` (columns 3 or 4) of `Card`s with a short `Heading` level 3 and one sentence each.
3. **Proof:** `Band` tone `muted` → `Grid` of `Stat`s, or `Columns 2-1` with a `Quote` / `testimonial` next to an `Image`.
4. **Pricing:** `Tabs` (monthly / yearly) or a `Toggle` bound to data and `Text` bound with `formatCurrency`; one `Card` per real plan.
5. **Questions:** `faq` block or `Accordion` of `Disclosure`s (the real questions, as many as there are).
6. **Call to action:** `Band` tone `brand` → `Heading` level 2 → one primary `Button`.

## Editorial home page
1. Hero band with the publication's promise and a link to the newest or most important story.
2. The newest articles (the content list section, or a surface `$source: entries` list as cards with images).
3. A `muted` band with two or three topics or categories as `Card`s with images, each linking to its archive.
4. An about or newsletter call to action.

## About page
1. One short paragraph of purpose (`Text` size `l`).
2. People or values as `Card`s in a `Grid` (2 or 3 columns).
3. Proof or history (`Stat`s or a short `List`).
4. Contact call to action.

## Pricing page
Hero with one sentence of value → plans (as above) → a comparison `Table` (at most 8 columns, `highlight` the recommended plan; it stacks into cards on phones) → FAQ about billing → call to action.

## Tools (RFC-0022)
Compute, don't promise: a result is a function call over the inputs, never text such as "calculated at checkout".
- **Calculator** (calories, loan, savings, price × seats): a `Card` holding a `Heading`, the inputs (`NumberField` with `unit`, `min`, `max`; `RadioGroup` `variant: buttons` for two to four choices; `Checkbox` for yes/no), two or three to a `Grid` row, then the result as a `Stat` right below. Start every number input as `""` in `data`; bind each input's `value` with `{path}`; compute with `add`/`multiply`/`divide`/`choose`/`round` and show with `formatNumber` or `formatCurrency`. A loan payment uses `power`: amount × r ÷ (1 − power(1 + r, −n)), with r the monthly rate (`divide` the yearly percent by 1200) and n the months.
- **Keypad calculator:** a `Text` bound to `/display`, a `Grid` of `Button`s with `append` (digits and operators), `C` as `set` "" and `=` as `set` with `calculate` over `/display`.
- **Chart:** a `Chart` bound to rows in `data` (`x` the label field, `series` the number fields), titled with what it shows, with a `caption` naming the source. Bar to compare, line over time, donut for parts of a whole.
- **Comparison:** a `Table` bound to rows, the first column naming the row, numbers aligned `end` with a `format`.
Check with `render_page`: no `input-label`, `chart-empty` or `overflow-x`, and the result shows a number with the sample values.
