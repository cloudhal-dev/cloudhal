import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import { I18nProvider, type MessageKey, translate, useT } from "../src/i18n/index.tsx";
import { tr } from "../src/i18n/tr.ts";

function leaves(obj: object, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === "string" ? [`${prefix}${k}`] : leaves(v as object, `${prefix}${k}.`),
  );
}

describe("i18n", () => {
  it("every English key has a Turkish translation (typed, but check at runtime too)", () => {
    expect(leaves(tr).sort()).toEqual(leaves(en).sort());
  });
  it("substitutes placeholders and falls back to English, then to the key", () => {
    expect(translate("tr", "overview.liveSnapshot", { id: "snap_1" })).toBe(
      "Canlı snapshot snap_1",
    );
    expect(translate("en", "common.rev", { rev: 3 })).toBe("rev 3");
    expect(translate("tr", "nope.missing" as MessageKey)).toBe("nope.missing");
  });
  it("useT reads the provider locale", () => {
    function Probe() {
      const t = useT();
      return <span>{t("common.save")}</span>;
    }
    render(
      <I18nProvider initialLocale="tr">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByText("Kaydet")).toBeInTheDocument();
  });
});
