/**
 * Input primitives (RFC-0020 §2, RFC-0022 §2): local inputs; values stay in the reader's browser,
 * and a live surface's runtime writes them to the data they are bound to.
 */
import { escapeHtml } from "../../markdown.ts";
import { fieldExtras, isBinding, json, model, type PrimitiveRenderer, str } from "../markup.ts";

export const toggleHtml: PrimitiveRenderer = (node, { id }) => {
  const p = node.props;
  const options = Array.isArray(p.options) ? p.options.slice(0, 8).map(str) : [];
  const radios = options
    .map(
      (o) =>
        `<label class="ch-toggle__option"><input type="radio" name="${id}" value="${escapeHtml(o)}"${model(node)}${o === str(p.value) ? " checked" : ""}><span>${escapeHtml(o)}</span></label>`,
    )
    .join("");
  return `<div class="ch-toggle" role="radiogroup"${p.label ? ` aria-label="${escapeHtml(str(p.label))}"` : ""}>${radios}</div>`;
};

export const selectHtml: PrimitiveRenderer = (node) => {
  const p = node.props;
  const options = Array.isArray(p.options) ? p.options.slice(0, 50).map(str) : [];
  return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><select class="ch-select"${model(node)}>${options.map((o) => `<option value="${escapeHtml(o)}"${o === str(p.value) ? " selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>`;
};

export const sliderHtml: PrimitiveRenderer = (node) => {
  const p = node.props;
  const n = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Number(v) : d);
  const out =
    node.live && isBinding(node.raw?.value)
      ? `<output class="ch-slider__value" data-ch-text="${json(node.raw?.value)}">${escapeHtml(str(p.value))}</output>`
      : `<output class="ch-slider__value">${escapeHtml(str(p.value))}</output>`;
  return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><span class="ch-slider"><input type="range" min="${n(p.min, 0)}" max="${n(p.max, 100)}" step="${n(p.step, 1) || "any"}" value="${n(p.value, 0)}"${model(node)}>${out}</span></label>`;
};

export const numberFieldHtml: PrimitiveRenderer = (node, { id }) => {
  const p = node.props;
  const x = fieldExtras(node, id);
  const n = (v: unknown) => (Number.isFinite(Number(v)) && v !== "" ? ` ${String(Number(v))}` : "");
  const bound = (k: string) => (n(p[k]) ? ` ${k}="${n(p[k]).trim()}"` : "");
  const unit = str(p.unit);
  return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><span class="ch-input-wrap"><input class="ch-input" type="number" inputmode="decimal" id="${id}"${bound("min")}${bound("max")}${p.step === undefined ? ' step="any"' : bound("step")}${p.placeholder ? ` placeholder="${escapeHtml(str(p.placeholder))}"` : ""} value="${escapeHtml(str(p.value))}"${model(node)}${x.attrs}>${unit ? `<span class="ch-input__unit">${escapeHtml(unit)}</span>` : ""}</span>${x.help}</label>`;
};

export const textFieldHtml: PrimitiveRenderer = (node, { id }) => {
  const p = node.props;
  const x = fieldExtras(node, id);
  const max = Number.isInteger(p.maxLength) ? Math.min(500, Number(p.maxLength)) : 500;
  return `<label class="ch-field"><span class="ch-field__label">${escapeHtml(str(p.label))}</span><input class="ch-input" type="${p.kind === "email" ? "email" : "text"}" id="${id}" maxlength="${max}"${p.placeholder ? ` placeholder="${escapeHtml(str(p.placeholder))}"` : ""} value="${escapeHtml(str(p.value))}"${model(node)}${x.attrs}>${x.help}</label>`;
};

export const checkboxHtml: PrimitiveRenderer = (node) =>
  `<label class="ch-check"><input type="checkbox"${node.props.checked === true ? " checked" : ""}${model(node, "checked")}><span>${escapeHtml(str(node.props.label))}</span></label>`;

export const radioGroupHtml: PrimitiveRenderer = (node, { id }) => {
  const p = node.props;
  const x = fieldExtras(node, id);
  const options = (Array.isArray(p.options) ? p.options : [])
    .slice(0, 8)
    .filter((o): o is Record<string, unknown> => typeof o === "object" && o !== null);
  const radios = options
    .map(
      (o) =>
        `<label class="ch-radio__option"><input type="radio" name="${id}" value="${escapeHtml(str(o.value))}"${model(node)}${str(o.value) === str(p.value) ? " checked" : ""}><span>${escapeHtml(str(o.label))}</span></label>`,
    )
    .join("");
  return `<fieldset class="ch-radio" data-variant="${p.variant === "buttons" ? "buttons" : "list"}"${x.attrs}><legend class="ch-field__label">${escapeHtml(str(p.label))}</legend><span class="ch-radio__options">${radios}</span>${x.help}</fieldset>`;
};
