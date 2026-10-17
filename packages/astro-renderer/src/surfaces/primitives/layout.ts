/** Layout primitives (RFC-0020 §2): stacks, rows, grids, bands, cards, tabs and disclosures. */
import { escapeHtml, safeHref } from "../../markdown.ts";
import {
  ALIGN,
  ambientOf,
  anchor,
  attr,
  CHILDREN,
  type PrimitiveRenderer,
  paint,
  SPACE,
  str,
} from "../markup.ts";

export const stackHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-stack"${attr("gap", p.gap, SPACE)}${attr("align", p.align, ALIGN)}>${CHILDREN}</div>`;

export const rowHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-row"${attr("gap", p.gap, SPACE)}${attr("align", p.align, ALIGN)}${attr("justify", p.justify, ["start", "center", "end", "between"])}${p.wrap === false ? ' data-wrap="no"' : ""}>${CHILDREN}</div>`;

export const gridHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-grid"${attr("cols", p.columns, ["1", "2", "3", "4", "5", "6"])}${attr("gap", p.gap, SPACE)}>${CHILDREN}</div>`;

export const columnsHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-columns"${attr("ratio", p.ratio, ["1-1", "2-1", "1-2", "1-1-1", "1-2-1"])}${attr("gap", p.gap, SPACE)}>${CHILDREN}</div>`;

export const bandHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-band"${anchor(p.anchor)}${paint(p)}${ambientOf(p).attrs}${attr("width", p.width, ["narrow", "wide", "full"])}${attr("spacing", p.spacing, SPACE)}>${ambientOf(p).canvas}<div class="ch-band__inner">${CHILDREN}</div></div>`;

export const cardHtml: PrimitiveRenderer = ({ props: p }) => {
  const href = typeof p.href === "string" ? safeHref(p.href) : undefined;
  return href
    ? `<a class="ch-card" href="${escapeHtml(href)}"${paint(p)}${ambientOf(p, true).attrs}>${CHILDREN}</a>`
    : `<div class="ch-card"${paint(p)}${ambientOf(p, true).attrs}>${CHILDREN}</div>`;
};

export const spacerHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-spacer"${attr("size", p.size, SPACE)} aria-hidden="true"></div>`;

export const dividerHtml: PrimitiveRenderer = () => `<hr class="ch-divider">`;

/** No JavaScript: one radio per panel; the theme's CSS shows the checked one's panel. */
export const tabsHtml: PrimitiveRenderer = (node, { id }) => {
  const panels = node.children.filter((c) => c.component === "TabPanel");
  const radios = panels
    .map(
      (c, i) =>
        `<input class="ch-tabs__radio" type="radio" name="${id}" id="${id}-${i}"${i === 0 ? " checked" : ""}><label class="ch-tabs__tab" for="${id}-${i}">${escapeHtml(str(c.props.label))}</label>`,
    )
    .join("");
  return `<div class="ch-tabs" data-count="${panels.length}">${radios}<div class="ch-tabs__panels">${CHILDREN}</div></div>`;
};

export const tabPanelHtml: PrimitiveRenderer = ({ props: p }) =>
  `<div class="ch-tabs__panel" role="group" aria-label="${escapeHtml(str(p.label))}">${CHILDREN}</div>`;

export const accordionHtml: PrimitiveRenderer = (_node, { id }) =>
  `<div class="ch-accordion" data-group="${id}">${CHILDREN}</div>`;

export const disclosureHtml: PrimitiveRenderer = ({ props: p }) =>
  `<details class="ch-disclosure"${p.open === true ? " open" : ""}><summary>${escapeHtml(str(p.summary))}</summary><div class="ch-disclosure__body">${CHILDREN}</div></details>`;
