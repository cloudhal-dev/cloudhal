# Country shapes

`countries-110m.json` draws the Analytics screen's country map (`CountryMap`, RFC-0006 §10.1).

- **Source:** [Natural Earth](https://www.naturalearthdata.com/) 1:110m Cultural Vectors, Admin 0 – Countries (`ne_110m_admin_0_countries`).
- **Licence:** public domain. Natural Earth asks for no permission or attribution; we credit it anyway ("Made with Natural Earth").
- **Changes:** only the `ISO_A2_EH` property is kept (Natural Earth's `ISO_A2` is `-99` for some countries); coordinates are rounded to two decimals. About 171 KB raw, 52 KB gzipped.
- **Loading:** imported with `?url`, so Vite emits it as a hashed file under `/assets/` and the Analytics route fetches it only when the map is shown.
