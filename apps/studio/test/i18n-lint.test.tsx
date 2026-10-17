import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { allFiles, format, lintFile } from "../scripts/design-lint.ts";
import { ALLOWED, coversText, isWords, lintText } from "../scripts/i18n-lint.ts";
import { I18nProvider, type TFunction, translate } from "../src/i18n/index.tsx";
import { ApiRequestError } from "../src/lib/api.ts";
import { apiErrorText } from "../src/lib/api-errors.ts";

/** The words the rule reports for `source` (a `.tsx` file unless `file` says otherwise). */
const flagged = (source: string, file = "apps/studio/src/components/X.tsx") =>
  lintText(file, source).map((v) => v.text);

describe("no hard-coded words (AGENTS.md hard rule 10)", () => {
  it("Studio and @cloudhal/ui have none", () => {
    const files = allFiles();
    // Both trees, `.ts` too (helpers and models build labels as well as screens do).
    expect(files.some((f) => f.includes("/packages/ui/src/blocks/kumo/"))).toBe(true);
    expect(files.some((f) => f.endsWith("/apps/studio/src/lib/api-errors.ts"))).toBe(true);
    const report = files
      .map((f) =>
        format(
          f,
          lintFile(f).filter((v) => v.rule === "i18n"),
        ),
      )
      .filter(Boolean);
    expect(report.join("\n")).toBe("");
  });

  it("reads words wherever a person reads them", () => {
    const source = `
      export function A({ removeLabel = "Remove", ok, x }) {
        toast.error("Save failed");
        const options = { label: "Hello world", id: "x" };
        document.title = "Studio home";
        if (!confirm("Delete it?")) return null;
        return (
          <div aria-label="Close dialog" title={ok ? "Yes" : "No"}>
            Hello there
            {"Bye now"}
            <B closeLabel="Close" placeholder={\`Search pages\`} />
            {x ?? "Untitled"}
          </div>
        );
      }`;
    expect(flagged(source)).toEqual([
      "Remove",
      "Save failed",
      "Hello world",
      "Studio home",
      "Delete it?",
      "Close dialog",
      "Yes",
      "No",
      "Hello there",
      "Bye now",
      "Close",
      "Search pages",
      "Untitled",
    ]);
  });

  it("finds tables of labels whatever their keys are called", () => {
    const source = `const LABEL = { draft: "Draft", review: "In review", tone: "primary" };`;
    expect(flagged(source, "packages/ui/src/blocks/X.ts")).toEqual(["Draft", "In review"]);
  });

  it("leaves code alone: ids, keys, classes, URLs, protocol values, logs", () => {
    const source = `
      export function A({ t }) {
        console.error("Something broke here");
        if (e.key === "Enter" || mode === "Needs approval") return null;
        throw new Error("nothing to save");
        return (
          <div className="grid items-start gap-5 @lg:grid-cols-2" data-state="In review"
               variant="primary" title={t("menus.save.title")} href="https://example.com/a b"
               aria-label={name} placeholder="you@example.com" label="Cloudhal">
            <code>cloudhal mcp --site my site</code>
            <kbd>Ctrl K</kbd>
            {t("common.save")} · {count} → {"—"}
          </div>
        );
      }`;
    expect(flagged(source)).toEqual([]);
  });

  it("skips Kumo's variant tables and lines marked i18n-ignore", () => {
    const source = `
      export const KUMO_X_VARIANTS = { size: { sm: { classes: "", description: "Small dialog" } } };
      // i18n-ignore: a proper noun the browser reports
      const options = { label: "Samsung Internet" };`;
    expect(flagged(source, "packages/ui/src/blocks/kumo/x/x.tsx")).toEqual([]);
  });

  it("knows words from tokens", () => {
    for (const s of ["Save", "Delete page", "Loading…", "Kept as written.", "no range given"])
      expect(isWords(s), s).toBe(true);
    for (const s of ["primary", "menus.save.title", "px-2 text-sm", "/api/sites", "OK", "en", "—"])
      expect(isWords(s), s).toBe(false);
    for (const s of ALLOWED.keys()) expect(isWords(s), s).toBe(false);
  });

  it("covers Studio and @cloudhal/ui sources, not tests or catalogs", () => {
    expect(coversText("apps/studio/src/routes/PagesPage.tsx")).toBe(true);
    expect(coversText("apps/studio/src/lib/menus.ts")).toBe(true);
    expect(coversText("packages/ui/src/blocks/StatusBadge.tsx")).toBe(true);
    expect(coversText("apps/studio/src/i18n/en.ts")).toBe(false);
    expect(coversText("apps/studio/test/i18n.test.tsx")).toBe(false);
    expect(coversText("packages/ui/test/blocks.test.tsx")).toBe(false);
    expect(coversText("packages/api/src/errors.ts")).toBe(false);
  });
});

describe("apiErrorText", () => {
  const t = ((key: Parameters<typeof translate>[1], params?: Record<string, string | number>) =>
    translate("tr", key, params)) as TFunction;
  const fail = (status: number, error: string, message = "English from the server") =>
    new ApiRequestError(status, { error, message });

  it("says the catalog's sentence for a known code, in the Studio language", () => {
    expect(apiErrorText(t, fail(403, "rank"))).toBe("Rolün buna izin vermiyor.");
    expect(apiErrorText(t, fail(409, "conflict"))).toBe(translate("tr", "errors.conflict"));
    expect(apiErrorText(t, new TypeError("Failed to fetch"))).toBe(
      translate("tr", "errors.api.network"),
    );
  });

  it("falls back to the server's message, then to the status", () => {
    expect(apiErrorText(t, fail(422, "invalid_props", "props.title is required"))).toBe(
      "props.title is required",
    );
    expect(apiErrorText(t, fail(502, "gateway", ""))).toBe("İstek başarısız oldu (HTTP 502).");
    expect(apiErrorText(t, undefined)).toBe(translate("tr", "errors.title"));
  });
});

describe("the page's language", () => {
  it("is set on the first render, not only after a switch", () => {
    document.documentElement.lang = "en";
    render(
      <I18nProvider initialLocale="tr">
        <span>x</span>
      </I18nProvider>,
    );
    expect(screen.getByText("x")).toBeInTheDocument();
    expect(document.documentElement.lang).toBe("tr");
  });
});
