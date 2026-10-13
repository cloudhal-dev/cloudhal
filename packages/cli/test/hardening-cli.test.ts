/**
 * Ops hardening in the generated Worker configs: Workers Logs sampling and opt-in Traces for both
 * Workers, query strings redacted from both (preview tokens), Smart Placement opt-in for the admin
 * Worker only.
 */
import { describe, expect, it } from "vitest";
import {
  adminWorkerConfig,
  observabilitySettings,
  siteWorkerConfig,
} from "../src/cloudflare/config.ts";
import { observabilityOf } from "../src/commands/deploy.ts";
import { parseObservabilityConfig } from "../src/config.ts";

const names = { name: "news" };
const admin = { ...names, studioDir: "studio", main: "./worker.ts" };
const site = { ...names, siteId: "site_abcdefgh" };

describe("observability and placement", () => {
  it("cloudhal.json `observability` is read leniently", () => {
    expect(parseObservabilityConfig({ logs: 0.25, traces: 0.05 })).toEqual({
      logs: 0.25,
      traces: 0.05,
    });
    expect(parseObservabilityConfig({ logs: 2, traces: "yes" })).toEqual({});
    expect(parseObservabilityConfig({ traces: true })).toEqual({ traces: true });
    expect(parseObservabilityConfig(1)).toBeUndefined();
    expect(observabilityOf({})).toEqual({ logs: 1, traces: false });
    expect(observabilityOf({ observability: { traces: true } })).toEqual({ logs: 1, traces: 1 });
    expect(observabilityOf({ observability: { logs: 0.5, traces: 0 } })).toEqual({
      logs: 0.5,
      traces: false,
    });
  });

  it("by default both Workers log every request, trace nothing and redact query strings", () => {
    const expected = { enabled: true, redact_query_string: true };
    expect(siteWorkerConfig(site).observability).toEqual(expected);
    expect(adminWorkerConfig(admin).observability).toEqual(expected);
    expect(adminWorkerConfig(admin)).not.toHaveProperty("placement");
  });

  it("sampling and traces reach both Workers; Smart Placement only the admin Worker", () => {
    const observability = { logs: 0.2, traces: 0.05 };
    expect(observabilitySettings(observability)).toEqual({
      enabled: true,
      head_sampling_rate: 0.2,
      redact_query_string: true,
      traces: { enabled: true, head_sampling_rate: 0.05 },
    });
    expect(siteWorkerConfig({ ...site, observability }).observability).toEqual(
      observabilitySettings(observability),
    );
    const placed = adminWorkerConfig({ ...admin, observability, placement: "smart" });
    expect(placed.placement).toEqual({ mode: "smart" });
    expect(placed.observability).toEqual(observabilitySettings(observability));
    expect(siteWorkerConfig({ ...site, observability })).not.toHaveProperty("placement");
    expect(observabilitySettings({ logs: 1, traces: 1 }).traces).toEqual({ enabled: true });
  });
});
