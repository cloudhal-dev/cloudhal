## Brand
The blog theme is an editorial theme: articles first, set in a calm reading column, with full-bleed bands for landing moments. It suits publications, newsrooms, journals and small company sites that publish.

## Colors
- Prefer the color tokens: `seed` (one color the palette is built from), `scheme` (tonal, vibrant, neutral, mono), `contrast` and `mode` (light, dark, or auto to follow the reader). The roles, light and dark, are derived and always meet WCAG contrast; get_design shows them.
- Without a seed, four settings apply: `{color.brand}` (buttons, the brand band, accents), `{color.link}`, `{color.surface}` (the page) and `{color.text}`. Change colors with set_theme_settings, never by hand.
- Bands and cards take a `surface`: `plain` (the page), `muted` (a soft step), `raised` (lifted, for cards), `inverse`, `brand` and `accent` (loud, their own text color), `gradient` and `mesh` (brand and accent light: one hero or call to action a page), and `dots`, `grid` or `noise` (quiet textures). Use loud surfaces at most twice a page. The older `tone` still works.
- A band can have an `anchor` (e.g. `pricing`), so a menu or button can link to `#pricing`.

## Typography
- `typePairing` sets headings and text in fonts that go together: editorial (Fraunces and Inter) for publications, modern (Space Grotesk and Inter) for products, humanist (Source Sans) for friendly sites, technical (JetBrains Mono headings) for developer tools, classic (Source Serif) for literary or institutional sites. With `system`, the `font` setting chooses one family (system, serif, humanist or mono).
- `typeScale` makes sizes fluid between phone and desktop: compact for dense, text-heavy sites; balanced for most; dramatic for landing pages with short, bold headlines.
- Headings: one level-1 per page; level 2 for sections; level 3 inside cards. Keep headings under about 60 characters, in sentence case.

## Layout
- `radius` sets the corners: none for sober, institutional sites; small or medium for most; large for friendly ones; full for pill buttons (cards stay modest). `density` sets the room: compact for dense, text-heavy sites, cozy for most, airy for landing pages and portfolios.
- The reading column is narrow (about 48rem). A `Band` with `width: wide` or `full` leaves it: use bands for heroes, feature grids, proof and calls to action, and keep long text in the column.
- Good rhythm on a landing page: hero band (`gradient`, `mesh`, `inverse` or `brand`) → plain section → `muted` or `dots` band → plain section with `raised` cards → `brand` or `accent` band call to action. Use `spacing: xl` on hero bands and `l` elsewhere.
- Grids: 2 or 3 columns for cards, 3 or 4 for stats. `Columns` with `ratio: 2-1` pairs text with an image or a quote.

## Components
- The theme styles every primitive. These look best: `Band`, `Columns`, `Grid`, `Card` (with an `Image` at `ratio: 16:9` first), `Stat`, `Quote`, `Tabs`, `Accordion`, and the blocks `testimonial`, `callout` and `faq`.
- Buttons: one `variant: primary` per section; `secondary` or `ghost` for the rest.
- A `Card` with `href` is a whole link: keep its text short (a heading and one sentence).
- Tools (calculators): put the inputs (`NumberField`, `RadioGroup` with `variant: buttons`, `Checkbox`) in a `Card`, two or three to a `Grid` row, and the result as a `Stat` right below them.
- Charts: a `Chart` sits in the reading column (or a `wide` band for dashboards), titled with what it shows ("Readers per month, 2026"), with a `caption` naming the source. Bar to compare, line over time, donut for parts of a whole.
- Tables: a `Table` compares a few things across the same fields (plans, specs). The first column names the row; numbers align `end` with a `format`; `highlight` marks the recommended row. On phones rows become cards, so keep labels short.
- Lists of articles come from the content list section or a surface entry source, not from copied titles.

## Imagery
- Carousels: a static hero band is the default. Use a `hero` `Carousel` only for two to five equal offers (same `aspect`, the strongest first); when the header is transparent over it, every slide opens with the same loud `Band`. Autoplay is off unless the site asks, and then `slow`. A `rail` carries logos, products or cards, a `gallery` photographs (with `thumbs`), `testimonials` quotes.
- Photographs from the media library, landscape for heroes and cards (`16:9` or `4:3`), never the same image twice on a page. Alt text says what is in the picture, in the page's language.

## Pages
- Home (editorial): hero band with the publication's promise → content list of the newest articles → a `muted` band with two or three sections or categories as cards → newsletter or about call to action.
- Landing: hero band → three to four features in a `Grid` → proof (`Stat` row or `testimonial`) → pricing (`Tabs` or `Toggle` with bound prices) → `faq` → call to action band.
- About: one short paragraph of purpose → people or values as cards → contact call to action.

## Don't
- Don't stack three bands of the same surface, or three grids of cards, in a row.
- Don't use placeholder text, `#` links or repeated images.
- Don't put long articles in a surface: articles are entries with a markdown body.
