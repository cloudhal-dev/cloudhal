/**
 * `Chart` (RFC-0022 §3): bar, line, area and donut charts drawn as SVG from a surface's data, with
 * a legend and the same numbers as a table (screen readers and feed readers that drop SVG still
 * get them). No chart library and no JavaScript needed: the server draws it.
 *
 * `chartInner` is self-contained on purpose (no imports, no outer names): the browser runtime gets
 * the same function as `/_cloudhal/chart.1.js` (`CHART_SCRIPT`) to redraw a chart whose data a
 * reader changes. Colors are theme tokens (`--ch-chart-1` … `--ch-chart-6`).
 */

export interface ChartSpec {
  kind?: unknown;
  title?: unknown;
  /** The rows (resolved from the surface's data). */
  data?: unknown;
  /** The field holding each row's category or date. */
  x?: unknown;
  series?: unknown;
  unit?: unknown;
  stacked?: unknown;
  height?: unknown;
}

/** The figure's inside: legend, SVG and data table. Every text is escaped; numbers only in SVG. */
export function chartInner(spec: ChartSpec, locale: string, labels: { data: string }): string {
  const esc = (v: unknown) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
    );
  const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === "object" && v !== null && !Array.isArray(v);
  const toNum = (v: unknown) =>
    typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : Number.NaN;
  const kind = ["bar", "line", "area", "donut"].includes(String(spec.kind))
    ? String(spec.kind)
    : "bar";
  const xField = typeof spec.x === "string" ? spec.x : "";
  const rows = (Array.isArray(spec.data) ? spec.data : []).filter(isObj).slice(0, 500);
  const series = (Array.isArray(spec.series) ? spec.series : [])
    .filter((s): s is Record<string, unknown> => isObj(s) && typeof s.field === "string")
    .slice(0, kind === "donut" ? 1 : 6)
    .map((s) => ({ field: String(s.field), label: String(s.label ?? s.field) }));
  const unit = typeof spec.unit === "string" ? spec.unit : "";
  const fmt = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 });
  const num = (n: number) => `${fmt.format(n)}${unit ? ` ${unit}` : ""}`;
  const value = (r: Record<string, unknown>, f: string) => {
    const n = toNum(r[f]);
    return Number.isFinite(n) ? n : 0;
  };
  const cats = rows.map((r) => String(r[xField] ?? ""));
  const color = (i: number) => `var(--ch-chart-${(i % 6) + 1})`;
  const empty = rows.length === 0 || series.length === 0;

  const table = `<details class="ch-chart__data"><summary>${esc(labels.data)}</summary><table><thead><tr><th scope="col">${esc(xField)}</th>${series
    .map((s) => `<th scope="col">${esc(s.label)}</th>`)
    .join("")}</tr></thead><tbody>${rows
    .map(
      (r, i) =>
        `<tr><th scope="row">${esc(cats[i])}</th>${series.map((s) => `<td>${esc(num(value(r, s.field)))}</td>`).join("")}</tr>`,
    )
    .join("")}</tbody></table></details>`;
  const legend =
    series.length > 1 || kind === "donut"
      ? `<ul class="ch-chart__legend">${(kind === "donut"
          ? cats.map((c, i) => ({ label: c, i }))
          : series.map((s, i) => ({ label: s.label, i }))
        )
          .map(
            (l) =>
              `<li><span class="ch-chart__swatch" style="background:${color(l.i)}"></span>${esc(l.label)}</li>`,
          )
          .join("")}</ul>`
      : "";
  if (empty) return `<p class="ch-chart__empty">–</p>${table}`;

  const W = 640;
  const H = spec.height === "s" ? 200 : spec.height === "l" ? 400 : 300;
  const label = esc(spec.title);
  let body = "";
  if (kind === "donut") {
    const s = series[0] as { field: string };
    const vals = rows.map((r) => Math.max(0, value(r, s.field)));
    const total = vals.reduce((a, b) => a + b, 0) || 1;
    const cx = W / 2;
    const cy = H / 2;
    const R = H / 2 - 8;
    const r0 = R * 0.6;
    let a = -Math.PI / 2;
    const pt = (rad: number, ang: number) =>
      `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    vals.forEach((v, i) => {
      if (v <= 0) return;
      const sweep = Math.min((v / total) * Math.PI * 2, Math.PI * 2 - 1e-4);
      const b = a + sweep;
      const large = sweep > Math.PI ? 1 : 0;
      body += `<path fill="${color(i)}" d="M ${pt(R, a)} A ${R} ${R} 0 ${large} 1 ${pt(R, b)} L ${pt(r0, b)} A ${r0} ${r0} 0 ${large} 0 ${pt(r0, a)} Z"><title>${esc(cats[i])}: ${esc(num(v))}</title></path>`;
      a = b;
    });
    body += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" class="ch-chart__total">${esc(num(vals.reduce((x, y) => x + y, 0)))}</text>`;
  } else {
    const stacked = spec.stacked === true && kind !== "line";
    const sums = rows.map((r) => series.reduce((t, s) => t + value(r, s.field), 0));
    const all = stacked ? sums : rows.flatMap((r) => series.map((s) => value(r, s.field)));
    const lo = Math.min(0, ...all);
    const hi = Math.max(0, ...all);
    const span = hi - lo || 1;
    const rough = span / 4;
    const mag = 10 ** Math.floor(Math.log10(rough));
    const step = ([1, 2, 2.5, 5, 10].find((m) => m * mag >= rough) ?? 10) * mag;
    const top = Math.ceil(hi / step) * step || step;
    const bottom = Math.floor(lo / step) * step;
    const L = 56;
    const T = 12;
    const B = 28;
    const plotW = W - L - 8;
    const plotH = H - T - B;
    const y = (v: number) => T + plotH - ((v - bottom) / (top - bottom || 1)) * plotH;
    for (let t = bottom; t <= top + step / 2; t += step) {
      body += `<line class="ch-chart__grid" x1="${L}" x2="${W - 8}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/><text class="ch-chart__tick" x="${L - 6}" y="${y(t).toFixed(1)}" text-anchor="end" dominant-baseline="middle">${esc(fmt.format(t))}</text>`;
    }
    const n = rows.length;
    const band = plotW / n;
    const every = Math.max(1, Math.ceil(n / 12));
    cats.forEach((c, i) => {
      if (i % every) return;
      const short = c.length > 12 ? `${c.slice(0, 11)}…` : c;
      body += `<text class="ch-chart__tick" x="${(L + band * (i + 0.5)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(short)}</text>`;
    });
    if (kind === "bar") {
      const inner = band * 0.72;
      rows.forEach((r, i) => {
        let base = 0;
        series.forEach((s, j) => {
          const v = value(r, s.field);
          const w = stacked ? inner : inner / series.length;
          const x = L + band * i + (band - inner) / 2 + (stacked ? 0 : w * j);
          const from = stacked ? base : 0;
          const to = from + v;
          if (stacked) base = to;
          const y1 = y(Math.max(from, to));
          const h = Math.abs(y(from) - y(to));
          body += `<rect fill="${color(j)}" x="${x.toFixed(1)}" y="${y1.toFixed(1)}" width="${Math.max(1, w - 2).toFixed(1)}" height="${h.toFixed(1)}" rx="2"><title>${esc(cats[i])}, ${esc(s.label)}: ${esc(num(v))}</title></rect>`;
        });
      });
    } else {
      const base = rows.map(() => 0);
      series.forEach((s, j) => {
        const pts = rows.map((r, i) => {
          const v = value(r, s.field) + (stacked ? (base[i] as number) : 0);
          return [L + band * (i + 0.5), y(v), v] as const;
        });
        const line = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
        if (kind === "area") {
          const floor = rows.map((_, i) => {
            const v = stacked ? (base[i] as number) : 0;
            return `${(L + band * (i + 0.5)).toFixed(1)},${y(Math.max(v, bottom)).toFixed(1)}`;
          });
          body += `<polygon fill="${color(j)}" fill-opacity="0.25" points="${line} ${floor.reverse().join(" ")}"/>`;
        }
        body += `<polyline fill="none" stroke="${color(j)}" stroke-width="2.5" stroke-linejoin="round" points="${line}"/>`;
        pts.forEach((p, i) => {
          body += `<circle fill="${color(j)}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.5"><title>${esc(cats[i])}, ${esc(s.label)}: ${esc(num(value(rows[i] as Record<string, unknown>, s.field)))}</title></circle>`;
        });
        if (stacked)
          rows.forEach((r, i) => {
            base[i] = (base[i] as number) + value(r, s.field);
          });
      });
    }
  }
  return `${legend}<svg class="ch-chart__svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}" preserveAspectRatio="xMidYMid meet">${body}</svg>${table}`;
}

/**
 * The browser's copy of `chartInner` (RFC-0022 §3), loaded only for live charts. Versioned like the
 * interaction runtime: bump the name with any change (a test pins the hash).
 */
export const CHART_SCRIPT = {
  path: "/_cloudhal/chart.1.js",
  code: `export const chartInner = ${chartInner.toString()};\n`,
} as const;
