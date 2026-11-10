/**
 * The overview's "Public site build" card (#150): hidden where the server does not rebuild the
 * site, the state badge while a build is queued or running, the last build, what visitors see
 * now (`served`, whoever built it), a failure that says whether a previous version stays online,
 * a failure a later cron or hand-started build superseded, and polling that stops when off.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToolLabel } from "../src/components/Audit.tsx";
import {
  POLL_BUSY_MS,
  POLL_IDLE_MS,
  SiteBuildCard,
  siteBuildPoll,
} from "../src/components/site-overview/SiteBuildCard.tsx";
import { on, serve, testQueryClient, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = (body: unknown) =>
  serve(on("GET", "/api/sites/site_1/site-build", { status: 200, body }));
const AT = new Date(Date.now() - 120_000).toISOString();
const LATER = new Date(Date.now() - 30_000).toISOString();
const failed = {
  at: AT,
  ok: false,
  durationMs: 9000,
  error: "exited with 1: astro: the theme threw",
};

describe("SiteBuildCard", () => {
  it("renders nothing where the server does not rebuild the site", async () => {
    status({ enabled: false });
    const qc = testQueryClient();
    const { container } = render(wrap(<SiteBuildCard siteId="site_1" />, "en", qc));
    await vi.waitFor(() =>
      expect(qc.getQueryState(["site-build", "site_1"])?.status).toBe("success"),
    );
    expect(qc.getQueryData(["site-build", "site_1"])).toEqual({ enabled: false });
    expect(container.textContent).toBe("");
  });

  it("stops polling when the feature is off or the request fails", () => {
    expect(siteBuildPoll({ enabled: false }, false)).toBe(false);
    expect(siteBuildPoll(undefined, true)).toBe(false);
    expect(siteBuildPoll({ enabled: true, state: "idle", last: null }, true)).toBe(false);
    expect(siteBuildPoll({ enabled: true, state: "idle", last: null }, false)).toBe(POLL_IDLE_MS);
    expect(siteBuildPoll({ enabled: true, state: "running", last: null }, false)).toBe(
      POLL_BUSY_MS,
    );
  });

  it("asks once and no more after the server says off", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const fetch = status({ enabled: false });
      const qc = testQueryClient();
      render(wrap(<SiteBuildCard siteId="site_1" />, "en", qc));
      await vi.waitFor(() =>
        expect(qc.getQueryState(["site-build", "site_1"])?.status).toBe("success"),
      );
      const calls = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(POLL_IDLE_MS * 3);
      expect(fetch.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows the last build, the snapshot and the duration", async () => {
    status({
      enabled: true,
      state: "idle",
      last: { at: AT, ok: true, durationMs: 41_600, snapshotId: "snap_live", state: "published" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Public site build")).toBeTruthy();
    expect(screen.getByText("Built")).toBeTruthy();
    expect(screen.getByText("snap_live")).toBeTruthy();
    expect(screen.getByText("42 s")).toBeTruthy();
    expect(screen.queryByText("The last build failed")).toBeNull();
  });

  it("says visitors see the coming soon page before the first publish", async () => {
    status({
      enabled: true,
      state: "idle",
      last: { at: AT, ok: true, durationMs: 300, state: "not-published" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("The coming soon page")).toBeTruthy();
    expect(screen.getByText("1 s")).toBeTruthy();
  });

  it("shows a running or queued build, and a site never built", async () => {
    status({ enabled: true, state: "running", last: null });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Building")).toBeTruthy();
    cleanup();
    status({ enabled: true, state: "queued", last: null });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Waiting to build")).toBeTruthy();
    cleanup();
    status({ enabled: true, state: "idle", last: null });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Not built yet")).toBeTruthy();
  });

  it("shows what is online from the served build, not only Studio's", async () => {
    // a hand-run build after Studio's: visitors see its snapshot
    status({
      enabled: true,
      state: "idle",
      last: { at: AT, ok: true, durationMs: 4000, snapshotId: "snap_studio", state: "published" },
      served: { at: LATER, snapshotId: "snap_cron", state: "published", source: "cron" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("snap_cron")).toBeTruthy();
    expect(screen.queryByText("snap_studio")).toBeNull();
    expect(screen.getByText("Built")).toBeTruthy();
  });

  it("drops a failure that a later served build superseded", async () => {
    status({
      enabled: true,
      state: "idle",
      last: failed,
      served: { at: LATER, snapshotId: "snap_fixed", state: "published", source: "manual" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Built")).toBeTruthy();
    expect(screen.getByText("snap_fixed")).toBeTruthy();
    expect(screen.queryByText("The last build failed")).toBeNull();
    expect(document.body.textContent).not.toContain("astro: the theme threw");
  });

  it("says nothing is online when a failure follows no served build", async () => {
    status({ enabled: true, state: "idle", last: failed, served: null });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByText("Nothing is online yet. The next publish tries again.")).toBeTruthy();
    expect(screen.queryByText(/The previous version stays online/)).toBeNull();
  });

  it("hides the output tail when the server leaves it out (no audit:read)", async () => {
    const { error: _, ...withoutError } = failed;
    status({
      enabled: true,
      state: "idle",
      last: withoutError,
      served: { at: AT, snapshotId: "snap_old", state: "published" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("The last build failed")).toBeTruthy();
    expect(document.body.querySelector("pre")).toBeNull();
  });

  it("reports a failure: the previous version stays online, and why", async () => {
    status({
      enabled: true,
      state: "idle",
      last: failed,
      served: { at: new Date(Date.now() - 3_600_000).toISOString(), snapshotId: "snap_old" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByText("The last build failed")).toBeTruthy();
    expect(
      screen.getByText("The previous version stays online. The next publish tries again."),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("astro: the theme threw");
    expect(document.body.querySelector("pre")).not.toBeNull();
  });

  it("names the audit row in the activity feed", () => {
    let label: ((tool: string) => string) | undefined;
    function Probe() {
      label = useToolLabel();
      return null;
    }
    render(wrap(<Probe />));
    expect(label?.("site.build")).toBe("Build public site");
    expect(label?.("asset.purge")).toBe("Take down file");
    expect(label?.("agent-key.elevate")).toBe("Elevate agent key");
    expect(label?.("something.else")).toBe("something.else");
  });
});
