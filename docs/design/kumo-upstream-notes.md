# Kumo upstream notes (not filed)

Issue texts for gaps Cloudhal found in [Kumo](https://github.com/cloudflare/kumo) **2.14.0** (the latest release on 2026-10-12) while making Studio speak Turkish. Nothing here has been filed: the maintainer decides what to send, and when. How Studio works around each gap today is in `docs/design/DESIGN.md` §2v "Kumo locale"; the one local change to Kumo is `patches/@cloudflare__kumo@2.14.0.patch`.

When Kumo is upgraded, go through this list: drop what the new release fixes (and the matching workaround or patch), and keep the rest.

---

## 1. `TimeseriesChart`: no way to format the tooltip's timestamp

**Status in Cloudhal:** patched locally (`tooltipTimestampFormat`).

### Title

`TimeseriesChart`: add `tooltipTimestampFormat` (tooltip time follows the browser locale and always shows seconds)

### Body

The tooltip heading of `TimeseriesChart` is formatted by a module-level formatter in `src/components/chart/TimeseriesChart.tsx`:

```ts
const tooltipDateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
});
```

So:

- the language is the browser's, not the app's: a Turkish UI in an English browser shows "Oct 8, 14:00:00" next to Turkish axis labels and footer;
- the time zone is the browser's: data bucketed in UTC cannot be labelled in UTC (we shift every point by the local offset to make it read UTC);
- the shape is fixed: daily buckets still show a time with seconds.

Every other text in the chart already has a hook (`xAxisTickFormat`, `yAxisTickFormat`, `tooltipValueFormat`, `tooltipFooter`), so the timestamp is the odd one out.

**Proposal.** An optional prop, used by both the series and the marker tooltip:

```ts
/** Formats the tooltip's timestamp heading. Defaults to the current browser-locale format. */
tooltipTimestampFormat?: (timestamp: number) => string;
```

```diff
- formatTimestamp,
+ formatTimestamp: tooltipTimestampFormat ?? formatTimestamp,
```

This is exactly what we apply as a two-line `pnpm patch` today; happy to open the PR.

---

## 2. `TimeseriesChart`: hard-coded English in the loader and tooltip

**Status in Cloudhal:** worked around (the loader is wrapped in `aria-hidden` and the block renders its own `role="status"`); the other strings are not reached by Studio.

### Title

`TimeseriesChart`: translatable "Loading chart", "+N more" and "Reference marker"

### Body

`TimeseriesChart` has three English strings with no prop and no `KumoLocaleProvider` entry:

- the skeleton's `aria-label="Loading chart"` (read by screen readers whenever `loading` is set);
- the tooltip's `+{hiddenCount} more` when there are more series than `tooltipMaxItems`;
- `"Reference marker"`, the fallback name of a marker without `label`.

**Proposal.** Add them to `KumoLocaleProvider`'s translations (e.g. `translations.chart.{loading, moreSeries(count), referenceMarker}`), and/or a `labels` prop on `TimeseriesChart`. A provider entry is preferable: apps set it once.

---

## 3. `ChoroplethMap`: legend reads "High" / "Low"

**Status in Cloudhal:** worked around (ECharts `visualMap.text` merged after Kumo's options).

### Title

`ChoroplethMap`: let the legend's end labels be set (`legendText` or locale)

### Body

With `showLegend`, `ChoroplethMap` builds `visualMap: { text: ["High", "Low"], … }` inside its options, with no prop to change it. Apps in other languages have to reach into the ECharts instance and `setOption({ visualMap: { text } })` after every Kumo update.

**Proposal.** `legendText?: [high: string, low: string]` (or `legendLabels: { high, low }`), defaulting to the provider's translations (`translations.map.{high, low}`) and then to English. While there: the default `valueFormat` uses `value.toLocaleString()` (browser locale); taking the provider's locale would make the default tooltip match the app.

---

## 4. `DateRangePicker`: hard-coded English and browser-locale months

**Status in Cloudhal:** avoided — Studio uses `DatePicker mode="range"` with localised `formatters`/`labels` instead.

### Title

`DateRangePicker`: hard-coded English strings and `en-US` / browser-locale dates (or remove it in favour of `DatePicker mode="range"`)

### Body

`DateRangePicker` is marked `@deprecated` ("Use `DatePicker` with `mode="range"`"), but it is still exported, documented and listed by the Kumo CLI, and it cannot be localised:

- weekday initials are a constant: `["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]`, and the week always starts on Sunday;
- `aria-label`s "Previous month", "Next month", "Edit month and year";
- the footer "Timezone: " and the "Reset Dates" button (also title case, against the Kumo sentence-case rule);
- day buttons' `aria-label`s use `toLocaleDateString("en-US", …)` plus English ", selected as start date" / ", selected as end date" / ", within selected range";
- month names use `toLocaleString("default", …)`, i.e. the browser locale, so the heading and the weekdays can be in different languages;
- the default `timezone` is "New York, NY, USA (GMT-4)";
- the picker cannot be given a selection (`selected`/`defaultValue`), only reports changes.

**Proposal.** Either remove it in the next major (the deprecation already points to `DatePicker`), or, if it stays, take `locale` (for `Intl`), `weekStartsOn` and a `labels` object, and read defaults from `KumoLocaleProvider`. In the meantime the docs and `kumo ls` could flag it as deprecated so new code does not pick it.

---

## 5. `KumoLocaleProvider` covers only `LayerDialog`

**Status in Cloudhal:** used for dialogs; everything else is passed per component.

### Title

`KumoLocaleProvider`: a `locale` and translations for the rest of Kumo (date picker, charts, maps)

### Body

`KumoLocaleProvider` accepts `translations.layerDialog.{close, cancel}` and nothing else reads it. Apps that run in another language have to localise every other component by hand, and some (items 1–4) cannot be localised at all.

**Proposal.**

- A `locale` prop (BCP 47) on the provider, read by every component that formats dates or numbers: `DatePicker` (react-day-picker's `formatters`/`labels` built with `Intl` in that locale, `weekStartsOn` from `Intl.Locale#getWeekInfo`, `lang`), `TimeseriesChart` (tooltip time and default value format), `ChoroplethMap`/`BubbleMap` (default `valueFormat`), and ECharts' own `locale` init option in `Chart` (today `echarts.init(el, theme)` is called without options, so an app cannot set it except by wrapping the `echarts` object it passes in).
- Translation keys for the remaining built-in strings (items 2–4, plus react-day-picker's labels: previous/next month, navigation, "Today", "selected").
- `DatePicker` keeps its per-instance props (they win over the provider).

For reference, this is how Cloudhal localises `DatePicker` without a date-fns locale, using only props Kumo passes through (`packages/ui/src/blocks/calendar-locale.ts`):

```ts
const caption = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone });
<DatePicker
  lang={locale}
  weekStartsOn={firstDayOfWeek(locale)}
  formatters={{ formatCaption: (m) => caption.format(m), formatWeekdayName: (d) => short.format(d) }}
  labels={{ labelPrevious: () => t.previousMonth, labelNext: () => t.nextMonth, labelDayButton: … }}
/>
```

---

## 6. `DeleteResource` block: every word is English

**Status in Cloudhal:** fixed in our copy (`packages/ui/src/blocks/kumo/delete-resource/`): a required `labels` prop replaces `resourceType`/`deleteButtonText`; Studio fills it with `deleteResourceProps` (`apps/studio/src/components/deleteLabels.ts`).

### Title

`DeleteResource` block: take its words as props (title, warning, "Type … to confirm", Cancel, aria-labels)

### Body

The block (`kumo add DeleteResource`) hard-codes "Delete {name}", "This action cannot be undone. This will permanently delete the …", "Type … to confirm:", "Cancel", `aria-label`s "Close", "Copy … to clipboard", "Type … to confirm deletion", and the button "Delete {resourceType}". It also lower-cases `resourceType` with `toLowerCase()` (wrong for Turkish "I"), and the sentence order is fixed in JSX, so a translation cannot move the name.

**Proposal.** A `labels` object (or `KumoLocaleProvider` keys) with templates that contain `{name}`, rendered with the name as the highlighted chip wherever the template puts it, as Cloudhal's copy does.

---

## 7. Right-to-left: Kumo's styles are physical

**Status in Cloudhal:** Studio and the `@cloudhal/ui` blocks use logical utilities only (lint `rtl-logical`, ADR-0033 D); Base UI's `DirectionProvider` (re-exported by Kumo) wraps Studio, fed by the locale registry's `dir` (ADR-0033 B). Kumo's own components are not patched yet: that waits until a right-to-left language is scheduled (ADR-0033 A1).

### Title

Support right-to-left layouts: logical properties in Kumo's components (and `dir`-aware placement)

### Body

Kumo 2.14's compiled CSS has about 239 physical utilities (`ml-*`, `mr-*`, `pl-*`, `pr-*`, `left-*`, `right-*`, `text-left`/`text-right`, `border-l`/`border-r`, `rounded-l`/`rounded-r`) and 12 logical ones (`ms-*`, `me-*`, `ps-*`, `pe-*`, `start-*`, `end-*`), plus 3 `rtl:` variants. In an Arabic or Hebrew UI under `<html dir="rtl">`, the sidebar, dialog close buttons, input addons, table cell alignment, toolbars and popover offsets therefore stay left-to-right, although Base UI underneath already supports direction (`DirectionProvider`, which Kumo re-exports at `@cloudflare/kumo/primitives/direction-provider`).

**Proposal.**

- Use Tailwind 4's logical utilities in every component (`ms`/`me`, `ps`/`pe`, `start`/`end`, `text-start`/`text-end`, `border-s`/`border-e`, `rounded-s`/`rounded-e`/`rounded-ss`…). In left-to-right pages they render exactly as today, so the change is invisible to existing users.
- Read the direction from Base UI's context for placement that is computed (popover side `inline-start`/`inline-end`, sidebar side, the order of icon and label where it matters).
- Document which icons mirror (back, forward, carets in breadcrumbs and menus) and offer a `mirrored`-aware icon slot.
- A lint in Kumo's own CI against new physical utilities keeps it that way.

Cloudhal's interim plan, if an RTL language comes before this: a generated `pnpm patch` that rewrites the compiled classes (the same mapping as our codemod, `scripts/i18n-codemod/logical-utilities.ts`), re-generated on each Kumo upgrade.
