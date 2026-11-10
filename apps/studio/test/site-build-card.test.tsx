/**
 * The overview's "Public site build" card (#150): hidden where the server does not rebuild the
 * site, the state badge while a build is queued or running, the last build (what visitors see,
 * the snapshot), and a failure that says the previous version stays online, with its output.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useToolLabel } from "../src/components/Audit.tsx";
import { SiteBuildCard } from "../src/components/site-overview/SiteBuildCard.tsx";
import { on, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const status = (body: unknown) =>
  serve(on("GET", "/api/sites/site_1/site-build", { status: 200, body }));
const AT = new Date(Date.now() - 120_000).toISOString();

describe("SiteBuildCard", () => {
  it("renders nothing where the server does not rebuild the site", async () => {
    const fetch = status({ enabled: false });
    const { container } = render(wrap(<SiteBuildCard siteId="site_1" />));
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(container.textContent).toBe("");
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

  it("reports a failure: the previous version stays online, and why", async () => {
    status({
      enabled: true,
      state: "idle",
      last: { at: AT, ok: false, durationMs: 9000, error: "exited with 1: astro: the theme threw" },
    });
    render(wrap(<SiteBuildCard siteId="site_1" />));
    expect(await screen.findByText("Failed")).toBeTruthy();
    expect(screen.getByText("The last build failed")).toBeTruthy();
    expect(
      screen.getByText("The previous version stays online. The next publish tries again."),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("astro: the theme threw");
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
