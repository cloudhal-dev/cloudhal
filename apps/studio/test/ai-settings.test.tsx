/**
 * Site settings › AI (RFC-0016 §2): off until the owner turns it on, the recommended model first,
 * the daily cap with today's use, gateway-only providers, a model that left the catalogue, the
 * unavailable state, and the read-only view below Administrator.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiSettingsSection } from "../src/components/AiSettings.tsx";
import type { AiPickerModel, AiSettings } from "../src/lib/api.ts";
import { asRole, bodyOf, INSTANCE, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const SETTINGS: AiSettings = {
  enabled: false,
  model: "@cf/zai-org/glm-4.7-flash",
  dailyLimit: 100,
  rev: 0,
};
const MODELS: AiPickerModel[] = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    recommended: "default",
    listed: true,
    contextWindow: 131072,
  },
  { id: "@cf/openai/gpt-oss-120b", recommended: "quality", listed: true },
  { id: "@cf/qwen/qwen3-30b", listed: true },
];
const PATH = "/api/sites/site_1/ai/settings";

function server(
  role: "owner" | "editor",
  {
    settings = SETTINGS,
    transport = "binding",
    models = MODELS,
    extra = [],
  }: {
    settings?: AiSettings;
    transport?: "binding" | "rest" | "none";
    models?: AiPickerModel[];
    extra?: Route[];
  } = {},
) {
  const [me] = asRole(role);
  return serve(
    ...extra,
    me as Route,
    on("GET", "/api/instance", {
      status: 200,
      body: { ...INSTANCE, features: { ...INSTANCE.features, ai: transport } },
    }),
    on("GET", PATH, {
      status: 200,
      body: {
        settings,
        usage: { day: "2026-10-14", requests: 7, inputTokens: 0, outputTokens: 0 },
        transport,
      },
    }),
    on("GET", "/api/sites/site_1/ai/models", {
      status: 200,
      body: { models, catalog: "live" },
    }),
  );
}

const renderSection = () => render(wrap(<AiSettingsSection siteId="site_1" />));

describe("AI settings", () => {
  it("is off until the owner turns it on; saves the switch, the model and the cap with rev", async () => {
    const fetch = server("owner", {
      extra: [on("PUT", PATH, { status: 200, body: { ...SETTINGS, enabled: true, rev: 1 } })],
    });
    renderSection();
    const toggle = await screen.findByRole("switch", { name: "AI in the editor" });
    expect(toggle).not.toBeChecked();
    expect(
      await screen.findByText(
        "Builds pages most reliably in Cloudhal's tests; writes Turkish well.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("131,072 tokens of context")).toBeInTheDocument();
    expect(screen.getByText("7 of 100 used today")).toBeInTheDocument();
    expect(
      screen.getByText("Selected text goes to Workers AI in this Cloudflare account.", {
        exact: false,
      }),
    ).toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole("spinbutton", { name: "Daily limit" }), {
      target: { value: "40" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({
        enabled: true,
        model: "@cf/zai-org/glm-4.7-flash",
        dailyLimit: 40,
        rev: 0,
      }),
    );
  });

  it("runs a provider's model only through a gateway", async () => {
    const fetch = server("owner", {
      extra: [on("PUT", PATH, { status: 200, body: { ...SETTINGS, rev: 1 } })],
    });
    renderSection();
    await screen.findByRole("switch", { name: "AI in the editor" });
    fireEvent.click(screen.getByText("AI Gateway and other providers"));
    const provider = await screen.findByLabelText("Model from another provider");
    fireEvent.change(provider, { target: { value: "openai/gpt-4.1-mini" } });
    expect(await screen.findByText("Set an AI Gateway first.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("AI Gateway"), { target: { value: "studio-gw" } });
    expect(
      screen.getByText("Selected text goes to openai through your AI Gateway.", { exact: false }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", PATH)).toEqual({
        enabled: false,
        model: "openai/gpt-4.1-mini",
        gateway: "studio-gw",
        dailyLimit: 100,
        rev: 0,
      }),
    );
  });

  it("warns when the chosen model left the catalogue", async () => {
    server("owner", { settings: { ...SETTINGS, model: "@cf/old/model-retired", rev: 2 } });
    renderSection();
    expect(
      await screen.findByText(
        "@cf/old/model-retired is no longer offered by Workers AI. Choose another model, or AI commands will fail.",
      ),
    ).toBeInTheDocument();
  });

  it("says how to connect Workers AI when the deployment can't reach it", async () => {
    server("owner", { transport: "none" });
    renderSection();
    expect(
      await screen.findByText("This deployment can't reach Workers AI yet"),
    ).toBeInTheDocument();
  });

  it("is read-only below Administrator", async () => {
    server("editor");
    renderSection();
    const toggle = await screen.findByRole("switch", { name: "AI in the editor" });
    expect(toggle).toBeDisabled();
    expect(screen.getByTestId("ai-model")).toHaveTextContent("@cf/zai-org/glm-4.7-flash");
  });
});
