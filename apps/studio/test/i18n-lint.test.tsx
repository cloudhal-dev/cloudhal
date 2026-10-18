import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { allFiles, format, lintFile } from "../scripts/design-lint.ts";
import { ALLOWED, coversText, isWords, lintText } from "../scripts/i18n-lint.ts";
import { logical } from "../scripts/i18n-message-rules.ts";
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
          lintFile(f).filter((v) => v.rule.startsWith("i18n") || v.rule.startsWith("rtl-")),
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

  it("finds plurals by hand (i18n-plural), not choices between states", () => {
    const rules = (source: string) =>
      lintText("apps/studio/src/components/X.tsx", source).map((v) => v.rule);
    expect(rules('const a = n === 1 ? t("x.one") : t("x.many", { count: n });')).toEqual([
      "i18n-plural",
    ]);
    expect(rules('const a = (items.length !== 1) ? t("x.many") : t("x.one");')).toEqual([
      "i18n-plural",
    ]);
    expect(rules('const a = n > 0 ? t("x.some", { count: n }) : t("x.none");')).toEqual([]);
    expect(rules('const a = n === 1 ? "" : t("x.many");')).toEqual([]);
    expect(rules('const a = t("x.words", { count: n });')).toEqual([]);
  });

  it("finds sentences assembled from messages and comma-joined lists (i18n-concat)", () => {
    const hits = (source: string) =>
      lintText("apps/studio/src/components/X.tsx", source).map((v) => v.rule);
    expect(hits('const a = `${t("a")} ${t("b")}`;')).toEqual(["i18n-concat"]);
    expect(hits('const a = t("a") + ": " + x;')).toEqual(["i18n-concat"]);
    expect(hits('const a = <p>{t("a")} {t("b")}</p>;')).toEqual(["i18n-concat"]);
    expect(hits('const a = names.join(", ");')).toEqual(["i18n-concat"]);
    expect(hits('const a = names.join("、");')).toEqual(["i18n-concat"]);
    // One message with a value, protocol joins and visual separators are fine.
    expect(hits('const a = `${t("a")} · ${count}`;')).toEqual([]);
    expect(hits('const a = ids.join(","); const b = parts.join(" · ");')).toEqual([]);
    expect(hits('const a = <p>{t("a")} <b>{name}</b></p>;')).toEqual([]);
    expect(hits('const a = names.join(", "); // i18n-ignore: clauses of a spoken label')).toEqual(
      [],
    );
  });

  it("finds formatters built on the spot instead of the cached layer (i18n-format)", () => {
    const hits = (source: string) =>
      lintText("apps/studio/src/components/X.tsx", source).map((v) => v.rule);
    expect(hits("const a = new Intl.NumberFormat(locale).format(n);")).toEqual(["i18n-format"]);
    expect(hits('const a = Intl.DateTimeFormat("en", { timeZone });')).toEqual(["i18n-format"]);
    expect(hits("const a = n.toLocaleString(locale);")).toEqual(["i18n-format"]);
    expect(hits("const a = new Date(iso).toLocaleDateString();")).toEqual(["i18n-format"]);
    expect(hits('const a = formatDate(locale, iso, { dateStyle: "medium" });')).toEqual([]);
    expect(hits("const a = new Intl.Locale(tag).language;")).toEqual([]);
    expect(
      hits(
        "const z = Intl.DateTimeFormat().resolvedOptions().timeZone; // i18n-ignore: reads the zone",
      ),
    ).toEqual([]);
  });

  it("finds physical utilities where logical ones mirror (rtl-logical, ADR-0033)", () => {
    const hits = (source: string) =>
      lintText("packages/ui/src/blocks/X.tsx", source).map((v) => v.rule);
    expect(hits('const a = <td className="w-0 text-right" />;')).toEqual(["rtl-logical"]);
    expect(hits('const a = cn("ml-auto flex", open && "sm:pl-4");')).toEqual([
      "rtl-logical",
      "rtl-logical",
    ]);
    expect(hits('const a = "absolute -right-1.5 top-0";')).toEqual(["rtl-logical"]);
    expect(hits('const a = "border-l rounded-tr-md";')).toEqual(["rtl-logical"]);
    expect(
      hits('const a = <td className="w-0 text-end ms-auto ps-4 -end-1.5 border-s" />;'),
    ).toEqual([]);
    // Words are not utilities; an exception carries its reason.
    expect(hits('const a = t("x"); // right-to-left and left-to-right')).toEqual([]);
    expect(
      hits('// i18n-ignore: Floating UI sets physical left/top\nconst a = "fixed left-0";'),
    ).toEqual([]);
  });

  it("finds directional icons used without DirectionalIcon (rtl-icon, ADR-0033 C1)", () => {
    const hits = (source: string) =>
      lintText("apps/studio/src/routes/X.tsx", source).map((v) => v.rule);
    expect(hits("const a = <ArrowRight size={12} aria-hidden />;")).toEqual(["rtl-icon"]);
    expect(hits("const a = <Button icon={CaretLeft} />;")).toEqual(["rtl-icon"]);
    expect(hits("const a = <Button icon={<SignOut />} />;")).toEqual(["rtl-icon"]);
    expect(hits("const icons = { url: ArrowSquareOut };")).toEqual(["rtl-icon"]);
    expect(hits('item("reply", label, ArrowBendUpLeft);')).toEqual(["rtl-icon"]);
    // Through the block, as a component through `directional`; imports and key names are not uses.
    expect(hits("const a = <DirectionalIcon icon={ArrowRight} size={12} />;")).toEqual([]);
    expect(hits("const a = <Button icon={directional(CaretLeft)} />;")).toEqual([]);
    expect(hits('import { ArrowRight, CaretLeft } from "@phosphor-icons/react";')).toEqual([]);
    expect(hits('const step = { ArrowLeft: -1, ArrowRight: 1 }; e.key === "ArrowLeft";')).toEqual(
      [],
    );
    // Physical or temporal directions stay as they are.
    expect(hits("const a = <><ArrowUp /><CaretDown /><ArrowClockwise /></>;")).toEqual([]);
    expect(
      hits(
        "// i18n-ignore: a chart axis points right in every language\nconst a = <ArrowRight />;",
      ),
    ).toEqual([]);
  });

  it("rewrites each physical utility to its logical twin (the codemod)", () => {
    const pairs: [string, string][] = [
      ["ml-2", "ms-2"],
      ["-mr-1", "-me-1"],
      ["md:pl-4", "md:ps-4"],
      ["pr-0.5", "pe-0.5"],
      ["left-0", "start-0"],
      ["-right-1.5", "-end-1.5"],
      ["text-left", "text-start"],
      ["group-hover:text-right", "group-hover:text-end"],
      ["border-l", "border-s"],
      ["border-r-2", "border-e-2"],
      ["rounded-tl-md", "rounded-ss-md"],
      ["rounded-r", "rounded-e"],
      ["scroll-ml-4", "scroll-ms-4"],
      ["mx-2", "mx-2"],
      ["border-red-500", "border-red-500"],
    ];
    for (const [from, to] of pairs) expect(logical(from), from).toBe(to);
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
