## Brand
The blog theme is an editorial theme: articles first, set in a calm reading column, with full-bleed bands for landing moments. It suits publications, newsrooms, journals and small company sites that publish.

## Colors
- The theme has four design settings: `{color.brand}` (buttons, the brand band, accents), `{color.link}`, `{color.surface}` (the page) and `{color.text}`. They always meet WCAG contrast; change them with set_theme_settings, never by hand.
- Bands take a tone: `surface` (the page), `muted` (a soft grey step), `brand` (the brand color, white text) and `inverse` (near-black, white text). Use `brand` or `inverse` at most twice a page; they are the loud moments.

## Typography
- The `font` setting chooses the family for the whole site (system, serif, humanist or mono). Serif reads as editorial, humanist as friendly, mono as technical.
- Headings: one level-1 per page; level 2 for sections; level 3 inside cards. Keep headings under about 60 characters, in sentence case.

## Layout
- The reading column is narrow (about 48rem). A `Band` with `width: wide` or `full` leaves it: use bands for heroes, feature grids, proof and calls to action, and keep long text in the column.
- Good rhythm on a landing page: hero band (`inverse` or `brand`) → plain section → `muted` band → plain section → `brand` band call to action. Use `spacing: xl` on hero bands and `l` elsewhere.
- Grids: 2 or 3 columns for cards, 3 or 4 for stats. `Columns` with `ratio: 2-1` pairs text with an image or a quote.

## Components
- The theme styles every primitive. These look best: `Band`, `Columns`, `Grid`, `Card` (with an `Image` at `ratio: 16:9` first), `Stat`, `Quote`, `Tabs`, `Accordion`, and the blocks `testimonial`, `callout` and `faq`.
- Buttons: one `variant: primary` per section; `secondary` or `ghost` for the rest.
- A `Card` with `href` is a whole link: keep its text short (a heading and one sentence).
- Tools (calculators): put the inputs (`NumberField`, `RadioGroup` with `variant: buttons`, `Checkbox`) in a `Card`, two or three to a `Grid` row, and the result as a `Stat` right below them.
- Lists of articles come from the content list section or a surface entry source, not from copied titles.

## Imagery
- Photographs from the media library, landscape for heroes and cards (`16:9` or `4:3`), never the same image twice on a page. Alt text says what is in the picture, in the page's language.

## Pages
- Home (editorial): hero band with the publication's promise → content list of the newest articles → a `muted` band with two or three sections or categories as cards → newsletter or about call to action.
- Landing: hero band → three to four features in a `Grid` → proof (`Stat` row or `testimonial`) → pricing (`Tabs` or `Toggle` with bound prices) → `faq` → call to action band.
- About: one short paragraph of purpose → people or values as cards → contact call to action.

## Don't
- Don't stack three bands of the same tone, or three grids of cards, in a row.
- Don't use placeholder text, `#` links or repeated images.
- Don't put long articles in a surface: articles are entries with a markdown body.
