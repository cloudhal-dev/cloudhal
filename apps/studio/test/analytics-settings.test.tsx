/**
 * Site settings › Analytics (RFC-0006 §10.3, DESIGN.md §2v): states from `features.analytics`,
 * gating by `analytics.read` / `analytics.settings`, the unique-visitors confirmation and salt
 * warning, the privacy notice, save with `rev` and the 409 flow; plus the form model.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AnalyticsSettingsSection } from "../src/components/AnalyticsSettings.tsx";
import {
  deploymentState,
  formOf,
  isDirty,
  missesAnalytics,
  patchOf,
  rebase,
  retentionFrom,
  retentionValue,
  vitalsCostPercent,
  vitalsFrom,
} from "../src/lib/analytics-settings.ts";
import type { AnalyticsFeature, AnalyticsSettings } from "../src/lib/api.ts";
import { asRole, bodyOf, INSTANCE, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FEATURE: AnalyticsFeature = {
  enabled: true,
  store: "wae",
  reader: "binding",
  liveDays: 92,
  budget: 8000,
  rollups: "scheduled",
  defaults: { enabled: true, uniqueVisitors: false, vitalsOneIn: 5 },
};

const SETTINGS: AnalyticsSettings = {
  siteId: "site_1",
  enabled: true,
  uniqueVisitors: false,
  vitalsOneIn: 5,
  rollupRetentionDays: null,
  planHint: null,
  rev: 3,
  stored: true,
};

const PATH = "/api/sites/site_1/analytics/settings";

/** `/api/me` for `role`, `/api/instance` with `feature`, and the settings GET. */
function server(
  role: "owner" | "administrator" | "editor" | "author" | "contributor",
  {
    feature = FEATURE,
    settings = SETTINGS,
    extra = [],
  }: {
    feature?: AnalyticsFeature | null;
    settings?: AnalyticsSettings | null;
    extra?: Route[];
  } = {},
) {
  const [me] = asRole(role);
  const instance = {
    ...INSTANCE,
    features: { ...INSTANCE.features, ...(feature ? { analytics: feature } : {}) },
  };
  return serve(
    ...extra,
    me as Route,
    on("GET", "/api/instance", { status: 200, body: instance }),
    ...(settings ? [on("GET", PATH, { status: 200, body: { settings, feature } })] : []),
  );
}

const renderSection = () => render(wrap(<AnalyticsSettingsSection siteId="site_1" />));
const toggle = (name: RegExp) => fireEvent.click(screen.getByRole("switch", { name }));

describe("analytics settings model", () => {
  const saved = formOf(SETTINGS);

  it("sends only the changed fields and knows when the form is dirty", () => {
    expect(patchOf(saved, saved)).toEqual({});
    expect(isDirty(saved, saved)).toBe(false);
    const form = { ...saved, enabled: false, rollupRetentionDays: 730 };
    expect(patchOf(saved, form)).toEqual({ enabled: false, rollupRetentionDays: 730 });
    expect(isDirty(saved, form)).toBe(true);
  });

  it("rebases unsaved edits on the latest copy: the server's changes win, others stay", () => {
    const form = { ...saved, enabled: false, planHint: "paid" as const };
    const latest = { ...saved, vitalsOneIn: 10 as const, planHint: "free" as const };
    expect(rebase(saved, form, latest)).toEqual({
      ...saved,
      enabled: false,
      vitalsOneIn: 10,
      planHint: "free",
    });
  });

  it("reads the deployment: off, can't read yet, ready", () => {
    expect(deploymentState(undefined)).toBe("off");
    expect(deploymentState({ ...FEATURE, enabled: false })).toBe("off");
    expect(deploymentState({ ...FEATURE, store: "none", reader: "none" })).toBe("off");
    expect(deploymentState({ ...FEATURE, reader: "none" })).toBe("cantRead");
    expect(deploymentState({ ...FEATURE, store: "sql", reader: "sql" })).toBe("ready");
  });

  it("maps select values and the vitals request cost", () => {
    expect(retentionValue(null)).toBe("forever");
    expect(retentionFrom("forever")).toBeNull();
    expect(retentionFrom("730")).toBe(730);
    expect(vitalsFrom("20")).toBe(20);
    expect(vitalsFrom("3")).toBe(5);
    expect(vitalsCostPercent(0)).toBe(0);
    expect(vitalsCostPercent(5)).toBe(20);
    expect(vitalsCostPercent(1)).toBe(100);
  });

  it("finds keys made before analytics:read", () => {
    expect(missesAnalytics({ scopes: ["site:read", "content:read"] })).toBe(true);
    expect(missesAnalytics({ scopes: ["site:read", "analytics:read"] })).toBe(false);
    expect(missesAnalytics({ scopes: ["*"] })).toBe(false);
  });
});

describe("AnalyticsSettingsSection", () => {
  it("shows the settings, the deployment and the base privacy notice to an Administrator", async () => {
    server("administrator");
    renderSection();
    expect(await screen.findByRole("switch", { name: /Count visits/ })).toBeChecked();
    expect(screen.getByRole("switch", { name: /Count unique visitors/ })).not.toBeChecked();
    expect(screen.getByText("On")).toBeInTheDocument();
    expect(screen.getByText(/Adds about 20% more requests/)).toBeInTheDocument();
    const facts = screen.getByTestId("analytics-deployment");
    expect(within(facts).getByText("Workers Analytics Engine")).toBeInTheDocument();
    expect(within(facts).getByText("Analytics Engine SQL")).toBeInTheDocument();
    expect(within(facts).getByText("Computed every hour")).toBeInTheDocument();
    const notice = screen.getByTestId("privacy-notice");
    expect(notice).toHaveAttribute("data-variant", "base");
    expect(
      within(notice).getByText(/counts visits with its own cookie-free analytics/),
    ).toBeVisible();
    expect(within(notice).queryByText(/To count unique visitors/)).toBeNull();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves only what changed with the rev, and says when the site picks it up", async () => {
    const fetch = server("administrator", {
      extra: [
        on("PUT", PATH, (init) => ({
          status: 200,
          body: {
            settings: { ...SETTINGS, ...JSON.parse(String(init?.body)), rev: 4 },
            purged: true,
            saltDeleted: false,
          },
        })),
      ],
    });
    renderSection();
    await screen.findByRole("switch", { name: /Count visits/ });
    toggle(/Count visits/);
    expect(screen.getByRole("switch", { name: /Count unique visitors/ })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Analytics settings saved")).toBeInTheDocument();
    expect(screen.getByText("The site picks up the change within a minute.")).toBeInTheDocument();
    expect(bodyOf(fetch, "PUT", PATH)).toEqual({ rev: 3, enabled: false });
    await waitFor(() => expect(screen.getByText("Off")).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("asks before counting unique visitors, then shows the matching notice", async () => {
    const fetch = server("owner", {
      extra: [
        on("PUT", PATH, (init) => ({
          status: 200,
          body: {
            settings: { ...SETTINGS, ...JSON.parse(String(init?.body)), rev: 4 },
            purged: false,
            saltDeleted: false,
          },
        })),
      ],
    });
    renderSection();
    await screen.findByRole("switch", { name: /Count unique visitors/ });
    toggle(/Count unique visitors/);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText("This is processing of personal data")).toBeInTheDocument();
    expect(within(dialog).getByText(/update your privacy policy/)).toBeInTheDocument();
    // not on until confirmed (the page behind the dialog is hidden from assistive tech)
    expect(
      screen.getByRole("switch", { name: /Count unique visitors/, hidden: true }),
    ).not.toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Count unique visitors" }));
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: /Count unique visitors/ })).toBeChecked(),
    );
    const notice = screen.getByTestId("privacy-notice");
    expect(notice).toHaveAttribute("data-variant", "unique");
    expect(
      within(notice).getByText(/It already reflects your unsaved changes/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await screen.findByText("Analytics settings saved");
    expect(bodyOf(fetch, "PUT", PATH)).toEqual({ rev: 3, uniqueVisitors: true });
  });

  it("cancelling the confirmation leaves unique visitors off", async () => {
    server("owner");
    renderSection();
    await screen.findByRole("switch", { name: /Count unique visitors/ });
    toggle(/Count unique visitors/);
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(screen.getByRole("switch", { name: /Count unique visitors/ })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("warns that turning unique visitors off deletes today's salt for the whole deployment", async () => {
    server("administrator", {
      settings: { ...SETTINGS, uniqueVisitors: true },
      extra: [
        on("PUT", PATH, {
          status: 200,
          body: {
            settings: { ...SETTINGS, uniqueVisitors: false, rev: 4 },
            purged: false,
            saltDeleted: true,
          },
        }),
      ],
    });
    renderSection();
    await screen.findByRole("switch", { name: /Count unique visitors/ });
    expect(screen.queryByTestId("salt-warning")).toBeNull();
    toggle(/Count unique visitors/);
    // no confirmation to turn it off
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const warning = screen.getByTestId("salt-warning");
    expect(within(warning).getByText("Saving deletes today's random value")).toBeInTheDocument();
    expect(
      within(warning).getByText(/Every site on this deployment shares it/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(
      await screen.findByText(
        "Today's random value was deleted for every site on this deployment.",
      ),
    ).toBeInTheDocument();
  });

  it("explains a conflict, loads the latest copy and keeps the other unsaved edits", async () => {
    let current: AnalyticsSettings = SETTINGS;
    const fetch = server("administrator", {
      settings: null,
      extra: [
        on("GET", PATH, () => ({ status: 200, body: { settings: current, feature: FEATURE } })),
        on("PUT", PATH, (init) => {
          const body = JSON.parse(String(init?.body));
          if (body.rev !== current.rev)
            return { status: 409, body: { error: "conflict", message: "stale rev" } };
          current = { ...current, ...body, rev: current.rev + 1 };
          return { status: 200, body: { settings: current, purged: true, saltDeleted: false } };
        }),
      ],
    });
    renderSection();
    await screen.findByRole("switch", { name: /Count visits/ });
    // someone else changes the sampling meanwhile
    current = { ...SETTINGS, vitalsOneIn: 10, rev: 4 };
    toggle(/Count visits/);
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("These settings changed somewhere else")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Load latest/ }));
    await waitFor(() =>
      expect(screen.getByText(/Adds about 10% more requests/)).toBeInTheDocument(),
    );
    expect(screen.queryByText("These settings changed somewhere else")).toBeNull();
    expect(screen.getByRole("switch", { name: /Count visits/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Analytics settings saved")).toBeInTheDocument();
    const puts = fetch.mock.calls.filter(
      ([, i]) => (i as RequestInit | undefined)?.method === "PUT",
    );
    expect(JSON.parse(String((puts.at(-1)?.[1] as RequestInit | undefined)?.body))).toEqual({
      rev: 4,
      enabled: false,
    });
  });

  it("lets an Editor read but not change the settings, and says why", async () => {
    server("editor");
    renderSection();
    const visits = await screen.findByRole("switch", { name: /Count visits/ });
    expect(visits).toBeDisabled();
    expect(visits).toHaveAttribute(
      "title",
      "Only Administrators and above can change analytics settings.",
    );
    const save = screen.getByRole("button", { name: "Save changes" });
    // Kumo turns a disabled button's title into its tooltip
    expect(save).toBeDisabled();
    // the notice can still be copied
    expect(screen.getByRole("button", { name: "Copy notice" })).toBeEnabled();
  });

  it("tells a Contributor why they see nothing, without asking the server", async () => {
    const fetch = server("contributor");
    renderSection();
    expect(await screen.findByText("You can't see analytics")).toBeInTheDocument();
    expect(screen.getByText("Only Authors and above see analytics.")).toBeInTheDocument();
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/analytics/"))).toBe(false);
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("explains a deployment that records but can't read yet, with on-read daily totals", async () => {
    server("administrator", { feature: { ...FEATURE, reader: "none", rollups: "on-read" } });
    renderSection();
    expect(
      await screen.findByText("Visits are recorded, but Studio can't read them yet"),
    ).toBeInTheDocument();
    const facts = screen.getByTestId("analytics-deployment");
    expect(within(facts).getByText("Not available yet")).toBeInTheDocument();
    expect(within(facts).getByText("Computed when someone opens Analytics")).toBeInTheDocument();
  });

  it("says when the deployment records nothing", async () => {
    server("administrator", {
      feature: { ...FEATURE, enabled: false, store: "none", reader: "none" },
    });
    renderSection();
    expect(
      await screen.findByText("Analytics aren't running on this deployment"),
    ).toBeInTheDocument();
    expect(screen.getByText("Not running")).toBeInTheDocument();
  });

  it("says when the server has no analytics instead of offering a broken form", async () => {
    server("administrator", { feature: null, settings: null });
    renderSection();
    expect(await screen.findByText("This server doesn't offer analytics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save changes" })).toBeNull();
  });

  it("copies the notice in the chosen language", async () => {
    const writeText = vi.fn(async () => undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    server("administrator");
    renderSection();
    await screen.findByTestId("privacy-notice");
    fireEvent.click(screen.getByRole("tab", { name: "Türkçe" }));
    expect(await screen.findByText(/kendi çerezsiz istatistik aracıyla sayar/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Copy notice" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(String((writeText.mock.calls[0] as unknown[])[0])).toMatch(
      /^İstatistikler\n\nBu site ziyaretleri/,
    );
    expect(await screen.findByText("Privacy notice copied")).toBeInTheDocument();
  });
});
