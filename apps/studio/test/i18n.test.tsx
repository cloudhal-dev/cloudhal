import { act, cleanup, render, screen } from "@testing-library/react";
import { Suspense } from "react";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { en } from "../src/i18n/en.ts";
import {
  I18nProvider,
  LOCALE_LIST,
  type Locale,
  loadNamespace,
  type MessageKey,
  NAMESPACES,
  resetNamespaces,
  translate,
  useI18n,
  useT,
  withMessages,
} from "../src/i18n/index.tsx";
import { messages as analyticsEn } from "../src/i18n/lazy/analytics.en.ts";
import { messages as analyticsTr } from "../src/i18n/lazy/analytics.tr.ts";
import { messages as analyticsSettingsEn } from "../src/i18n/lazy/analyticsSettings.en.ts";
import { messages as analyticsSettingsTr } from "../src/i18n/lazy/analyticsSettings.tr.ts";
import { messages as commentsEn } from "../src/i18n/lazy/comments.en.ts";
import { messages as commentsTr } from "../src/i18n/lazy/comments.tr.ts";
import { messages as commentsSettingsEn } from "../src/i18n/lazy/commentsSettings.en.ts";
import { messages as commentsSettingsTr } from "../src/i18n/lazy/commentsSettings.tr.ts";
import { messages as readersEn } from "../src/i18n/lazy/readers.en.ts";
import { messages as readersTr } from "../src/i18n/lazy/readers.tr.ts";
import { messages as scheduleSettingsEn } from "../src/i18n/lazy/scheduleSettings.en.ts";
import { messages as scheduleSettingsTr } from "../src/i18n/lazy/scheduleSettings.tr.ts";
import { messages as schedulesEn } from "../src/i18n/lazy/schedules.en.ts";
import { messages as schedulesTr } from "../src/i18n/lazy/schedules.tr.ts";
import { tr } from "../src/i18n/tr.ts";

afterEach(cleanup);

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

describe("lazy message namespaces", () => {
  const modules = {
    analytics: [analyticsEn, analyticsTr],
    analyticsSettings: [analyticsSettingsEn, analyticsSettingsTr],
    comments: [commentsEn, commentsTr],
    commentsSettings: [commentsSettingsEn, commentsSettingsTr],
    readers: [readersEn, readersTr],
    scheduleSettings: [scheduleSettingsEn, scheduleSettingsTr],
    schedules: [schedulesEn, schedulesTr],
  } as const;

  // The setup file loads every namespace; these tests start from nothing and restore it.
  afterAll(() =>
    Promise.all(LOCALE_LIST.flatMap((l) => NAMESPACES.map((ns) => loadNamespace(ns, l)))),
  );

  it("keeps English and Turkish on the same keys, and out of the core catalogs", () => {
    expect(Object.keys(modules).sort()).toEqual([...NAMESPACES].sort());
    for (const [ns, [enModule, trModule]] of Object.entries(modules)) {
      expect(Object.keys(enModule)).toEqual([ns]);
      expect(leaves(trModule).sort()).toEqual(leaves(enModule).sort());
      expect(leaves(enModule).length).toBeGreaterThan(0);
      expect(en).not.toHaveProperty(ns);
      expect(tr).not.toHaveProperty(ns);
    }
  });

  it("speaks Turkish in the comment namespaces (no English left behind)", () => {
    const flat = (o: object, prefix = ""): [string, string][] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === "string" ? [[`${prefix}${k}`, v]] : flat(v as object, `${prefix}${k}.`),
      );
    for (const [enModule, trModule] of [
      [commentsEn, commentsTr],
      [commentsSettingsEn, commentsSettingsTr],
      [schedulesEn, schedulesTr],
      [scheduleSettingsEn, scheduleSettingsTr],
    ] as const) {
      const english = new Map(flat(enModule));
      // Placeholders, product names and codes may stay as they are; sentences may not.
      const same = flat(trModule).filter(
        ([k, v]) =>
          english.get(k) === v && /[a-z]{4,} [a-z]{3,}/i.test(v) && !/^Cloudflare /.test(v),
      );
      expect(same).toEqual([]);
    }
    expect(commentsTr.comments.title).toBe("Yorumlar");
    expect(commentsTr.comments.words.untrustedTitle).toBe("Güvenilmeyen okur metni");
    expect(schedulesTr.schedules.title).toBe("Zamanlamalar");
    expect(schedulesTr.schedules.calendar.nav.views.agenda).toBe("Ajanda");
  });

  it("loads a namespace when a component asks for it, without ever showing its keys", async () => {
    resetNamespaces();
    expect(translate("tr", "readers.title")).toBe("readers.title");
    const seen: string[] = [];
    function Probe() {
      const t = useT("readers");
      seen.push(t("readers.title"));
      return <span>{t("readers.title")}</span>;
    }
    // Awaited: React retries a suspended render inside the act scope that started it.
    await act(async () => {
      render(
        <I18nProvider initialLocale="tr">
          <Suspense fallback={<span>waiting</span>}>
            <Probe />
          </Suspense>
        </I18nProvider>,
      );
    });
    expect(await screen.findByText("Okurlar")).toBeInTheDocument();
    expect(seen).toEqual(["Okurlar"]);
    expect(translate("tr", "readers.title")).toBe("Okurlar");
    // Only the language on screen was fetched.
    expect(translate("en", "readers.title")).toBe("readers.title");
  });

  it("loads a route's namespaces together with its module", async () => {
    resetNamespaces();
    const route = await withMessages(Promise.resolve({ Page: "module" }), ["analytics"], ["en"]);
    expect(route).toEqual({ Page: "module" });
    expect(translate("en", "analytics.range.apply")).toBe("Apply");
    expect(translate("tr", "analytics.range.apply")).toBe("Apply");
  });

  it("switches the language only once the namespaces on screen are there in it", async () => {
    resetNamespaces();
    await loadNamespace("readers", "en");
    let fallbacks = 0;
    let switchTo: (locale: Locale) => void = () => {};
    function Fallback() {
      fallbacks++;
      return null;
    }
    function Probe() {
      const { t, setLocale } = useI18n("readers");
      switchTo = setLocale;
      return <span>{t("readers.title")}</span>;
    }
    render(
      <I18nProvider initialLocale="en">
        <Suspense fallback={<Fallback />}>
          <Probe />
        </Suspense>
      </I18nProvider>,
    );
    expect(screen.getByText("Readers")).toBeInTheDocument();
    await act(async () => switchTo("tr"));
    expect(await screen.findByText("Okurlar")).toBeInTheDocument();
    expect(fallbacks).toBe(0);
  });
});
