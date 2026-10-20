/** Data primitives (RFC-0022 §3–§4): charts drawn as SVG and real tables. */
import { chartInner } from "../../chart.ts";
import { escapeHtml } from "../../markdown.ts";
import { json, type PrimitiveRenderer, str } from "../markup.ts";

/** RFC-0022 §3: drawn here as SVG; a live surface redraws it when its data changes. */
export const chartHtml: PrimitiveRenderer = (node, { media }) => {
  const p = node.props;
  const locale = media?.locale ?? "en";
  const dataLabel = locale.startsWith("tr") ? "Verileri göster" : "Show the data";
  const live =
    node.live && node.raw
      ? ` data-ch-chart="${json(node.raw)}" data-ch-label="${escapeHtml(dataLabel)}"`
      : "";
  const rows = Array.isArray(p.data) ? p.data : [];
  const caption = str(p.caption);
  return `<figure class="ch-chart"${live}${rows.length === 0 ? " data-ch-chart-empty" : ""}><figcaption class="ch-chart__title">${escapeHtml(str(p.title))}</figcaption><div class="ch-chart__body">${chartInner(p, locale, { data: dataLabel })}</div>${caption ? `<p class="ch-chart__caption">${escapeHtml(caption)}</p>` : ""}</figure>`;
};

const isRow = (r: unknown): r is Record<string, unknown> =>
  typeof r === "object" && r !== null && !Array.isArray(r);

/** A table cell in its column's format (numbers, currency, percent, dates in UTC). */
function cellText(v: unknown, c: Record<string, unknown>, locale: string): string {
  if (v === undefined || v === null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  const digits = Number.isInteger(c.digits) ? Number(c.digits) : undefined;
  try {
    if (c.format === "number" && Number.isFinite(n))
      return new Intl.NumberFormat(locale, { maximumFractionDigits: digits ?? 2 }).format(n);
    if (c.format === "currency" && Number.isFinite(n) && /^[A-Z]{3}$/.test(str(c.currency)))
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: str(c.currency),
        ...(digits !== undefined ? { maximumFractionDigits: digits } : {}),
      }).format(n);
    if (c.format === "percent" && Number.isFinite(n))
      return new Intl.NumberFormat(locale, {
        style: "percent",
        maximumFractionDigits: digits ?? 0,
      }).format(n);
    if (c.format === "date") {
      const d = new Date(str(v));
      if (!Number.isNaN(d.getTime()))
        return new Intl.DateTimeFormat(locale, {
          dateStyle: "medium",
          timeZone: "UTC",
        }).format(d);
    }
  } catch {
    // an unknown currency or locale: show the value as it is
  }
  return str(v);
}

/**
 * RFC-0022 §4: a real table; `data-label` lets the theme stack rows into cards on phones, and
 * `data-phone="hide"` leaves a column out of those cards (never the first, which names the row).
 */
export const tableHtml: PrimitiveRenderer = ({ props: p }, { media }) => {
  const locale = media?.locale ?? "en";
  const rows = (Array.isArray(p.rows) ? p.rows : []).filter(isRow).slice(0, 200);
  const columns = (Array.isArray(p.columns) ? p.columns : []).filter(isRow).slice(0, 8);
  const hl = isRow(p.highlight) ? p.highlight : undefined;
  const extra = (c: Record<string, unknown>, i: number) =>
    `${c.align === "end" ? ' data-align="end"' : ""}${i > 0 && c.hideOnPhone === true ? ' data-phone="hide"' : ""}`;
  const head = columns
    .map((c, i) => `<th scope="col"${extra(c, i)}>${escapeHtml(str(c.label))}</th>`)
    .join("");
  const body = rows
    .map((r) => {
      const marked = hl && str(r[str(hl.field)]) === str(hl.equals);
      return `<tr${marked ? ' data-highlight="yes"' : ""}>${columns
        .map(
          (c, i) =>
            `<td data-label="${escapeHtml(str(c.label))}"${extra(c, i)}>${escapeHtml(cellText(r[str(c.field)], c, locale))}</td>`,
        )
        .join("")}</tr>`;
    })
    .join("");
  return `<div class="ch-table-wrap"><table class="ch-table"${p.striped === true ? ' data-striped="yes"' : ""}><caption>${escapeHtml(str(p.caption))}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
};
