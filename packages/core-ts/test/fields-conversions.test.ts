import type { FieldDefinition } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  canConvert,
  convertFieldValue,
  dayIn,
  escapeMarkdown,
  markdownToPlain,
  midnightIn,
  normalizeThroughMarkers,
  rewriteFields,
} from "../src/fields/index.ts";

const L = { en: { label: "x" } };
const ctx = { timeZone: "Europe/Istanbul", defaultLocale: "en" };
const def = (over: Record<string, unknown>) =>
  ({ key: "v", labels: L, localized: false, ...over }) as unknown as FieldDefinition;
const select = (multiple = false) =>
  def({
    type: "select",
    multiple,
    options: [
      { value: "talk", labels: { en: "Talk" } },
      { value: "workshop", labels: { en: "Hands-on workshop" } },
    ],
  });

describe("RFC-0041 §6 conversion table", () => {
  it("lists the closed table; a type always converts to itself", () => {
    expect(canConvert("text", "richText")).toBe(true);
    expect(canConvert("richText", "number")).toBe(false);
    expect(canConvert("boolean", "boolean")).toBe(true);
    expect(canConvert("boolean", "text")).toBe(false);
  });

  it("text ↔ rich text: escaped markup, plain words back", () => {
    const escaped = convertFieldValue("text", def({ type: "richText" }), "a *b* [c] # d", ctx);
    expect(escaped).toEqual({ ok: true, value: "a \\*b\\* \\[c\\] # d" });
    expect(escapeMarkdown("# title\n1. one")).toBe("\\# title\n1\\. one");
    const plain = convertFieldValue(
      "richText",
      def({ type: "text" }),
      "# Hi\n\nSee **the** [docs](https://x.y).\n::callout{}\n",
      ctx,
    );
    expect(plain).toEqual({ ok: true, value: "Hi See the docs." });
    expect(markdownToPlain("a\n\nb", true)).toBe("a\nb");
  });

  it("text → number accepts numbers only, and the definition's bounds", () => {
    expect(convertFieldValue("text", def({ type: "number" }), " 12.5 ", ctx)).toEqual({
      ok: true,
      value: 12.5,
    });
    expect(convertFieldValue("text", def({ type: "number" }), "12 seats", ctx).ok).toBe(false);
    const bounded = def({ type: "number", integer: true, maximum: 10 });
    expect(convertFieldValue("text", bounded, "11", ctx).ok).toBe(false);
    expect(convertFieldValue("number", def({ type: "text" }), 7, ctx)).toEqual({
      ok: true,
      value: "7",
    });
  });

  it("text → select by value or default-locale label; select ↔ select and → text", () => {
    expect(convertFieldValue("text", select(), "talk", ctx)).toEqual({ ok: true, value: "talk" });
    expect(convertFieldValue("text", select(true), "hands-on WORKSHOP", ctx)).toEqual({
      ok: true,
      value: ["workshop"],
    });
    expect(convertFieldValue("text", select(), "panel", ctx).ok).toBe(false);
    expect(convertFieldValue("select", select(true), "talk", ctx)).toEqual({
      ok: true,
      value: ["talk"],
    });
    expect(convertFieldValue("select", select(), ["talk"], ctx)).toEqual({
      ok: true,
      value: "talk",
    });
    expect(convertFieldValue("select", select(), ["talk", "workshop"], ctx).ok).toBe(false);
    expect(convertFieldValue("select", select(), [], ctx)).toEqual({ ok: true, value: undefined });
    expect(convertFieldValue("select", def({ type: "text" }), ["talk", "workshop"], ctx)).toEqual({
      ok: true,
      value: "talk, workshop",
    });
  });

  it("text ↔ url keeps the string when it is a link", () => {
    expect(convertFieldValue("text", def({ type: "url" }), " https://x.y/a ", ctx)).toEqual({
      ok: true,
      value: "https://x.y/a",
    });
    expect(convertFieldValue("text", def({ type: "url" }), "javascript:alert(1)", ctx).ok).toBe(
      false,
    );
    expect(convertFieldValue("url", def({ type: "text" }), "/about", ctx).ok).toBe(true);
  });

  it("date → datetime at 00:00 in the site zone; datetime → the day in its own zone", () => {
    expect(midnightIn("2026-11-05", "Europe/Istanbul")).toBe("2026-11-04T21:00:00Z");
    expect(midnightIn("2026-03-29", "Europe/Berlin")).toBe("2026-03-28T23:00:00Z");
    expect(convertFieldValue("date", def({ type: "datetime" }), "2026-11-05", ctx)).toEqual({
      ok: true,
      value: { at: "2026-11-04T21:00:00Z", timeZone: "Europe/Istanbul" },
    });
    expect(dayIn("2026-11-04T22:30:00Z", "Europe/Istanbul")).toBe("2026-11-05");
    const at = { at: "2026-11-04T22:30:00Z", timeZone: "America/New_York" };
    expect(convertFieldValue("datetime", def({ type: "date" }), at, ctx)).toEqual({
      ok: true,
      value: "2026-11-04",
    });
  });

  it("pairs outside the table do not convert", () => {
    expect(convertFieldValue("boolean", def({ type: "date" }), true, ctx)).toMatchObject({
      ok: false,
    });
  });
});

describe("RFC-0041 §6 rewriting through a marker", () => {
  const marker = { id: "snap_01HZX8K3Q9MG" };
  it("rename moves the value; the new key wins when both exist", () => {
    const d = def({ type: "text", key: "speaker", migration: { ...marker, fromKey: "presenter" } });
    const base = { convert: ctx, translation: false, pristine: true };
    expect(rewriteFields({ def: d, values: { presenter: "Ada" }, ...base }).values).toEqual({
      speaker: "Ada",
    });
    expect(
      rewriteFields({ def: d, values: { presenter: "Ada", speaker: "Grace" }, ...base }).values,
    ).toEqual({ speaker: "Grace" });
  });

  it("a type change converts pristine values always, others only when they do not fit", () => {
    const d = def({ type: "richText", migration: { ...marker, fromType: "text" } });
    const base = { def: d, values: { v: "a*b" }, convert: ctx, translation: false };
    expect(rewriteFields({ ...base, pristine: true }).values).toEqual({ v: "a\\*b" });
    expect(rewriteFields({ ...base, pristine: false }).values).toBeUndefined();
    const n = def({ type: "number", migration: { ...marker, fromType: "text" } });
    const bad = { def: n, values: { v: "lots" }, convert: ctx, translation: false, pristine: true };
    expect(rewriteFields(bad).change?.kind).toBe("unconvertible");
    expect(rewriteFields({ ...bad, onInvalid: "clear" })).toMatchObject({
      values: {},
      change: { kind: "cleared" },
    });
  });

  it("localization off drops translations' copies; removal drops every value", () => {
    const off = def({
      type: "text",
      localized: false,
      migration: { ...marker, fromLocalized: true },
    });
    const values = { v: "copy", other: 1 };
    expect(normalizeThroughMarkers([off], values, { convert: ctx, translation: true })).toEqual({
      other: 1,
    });
    expect(normalizeThroughMarkers([off], values, { convert: ctx, translation: false })).toBe(
      undefined,
    );
    const gone = def({ type: "text", migration: marker });
    expect(normalizeThroughMarkers([gone], values, { convert: ctx, translation: false })).toEqual({
      other: 1,
    });
  });
});
