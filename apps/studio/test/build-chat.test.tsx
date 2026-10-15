/**
 * Studio's Build chat (RFC-0020 §6, phase 20c): off until AI is on; a brief streams the model's
 * notes, what it is writing and the turn's outcome; refusals are worded.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BuildChat } from "../src/components/BuildChat.tsx";
import { wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const settings = (enabled: boolean, transport = "binding") =>
  Response.json({
    settings: { enabled, model: "@cf/zai-org/glm-4.7-flash", dailyLimit: 100, rev: 1 },
    usage: { requests: 0 },
    transport,
  });

function ndjson(events: unknown[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const e of events) controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson" } },
  );
}

function serve(build: () => Response, enabled = true, transport = "binding") {
  const fn = vi.fn(async (url: string, _init?: RequestInit) =>
    url.endsWith("/ai/settings") ? settings(enabled, transport) : build(),
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("Build chat", () => {
  it("says AI is off, with the way to settings", async () => {
    serve(() => new Response(null, { status: 404 }), false);
    render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    expect(await screen.findByText("AI is off for this site")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open settings" })).toHaveAttribute(
      "href",
      "/sites/site_1/settings",
    );
  });

  it("says when the deployment cannot reach Workers AI", async () => {
    serve(() => new Response(null, { status: 404 }), true, "none");
    render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    expect(await screen.findByText("This deployment can't reach Workers AI")).toBeInTheDocument();
  });

  it("sends the brief and shows the model's notes and the outcome", async () => {
    const fetch = serve(() =>
      ndjson([
        { type: "round", round: 1 },
        { type: "say", text: "I'll add a dark hero." },
        { type: "writing", components: ["Band", "Heading"] },
        { type: "step", ok: true, rev: 2, ops: 2, repairs: ['root: component "stack" → "Stack"'] },
        { type: "step", ok: false, issues: ["/sections/1/components/3/props/level at most 4"] },
        { type: "round", round: 2 },
        { type: "step", ok: true, rev: 3, ops: 2, repairs: [] },
        { type: "done", rev: 3, steps: 2, refused: 1, usage: { inputTokens: 1, outputTokens: 1 } },
      ]),
    );
    render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    fireEvent.change(await screen.findByLabelText("What should the page have?"), {
      target: { value: "A dark hero with a headline" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByText("I'll add a dark hero.")).toBeInTheDocument();
    expect(
      await screen.findByText("2 steps applied; 1 refused and sent back to the model"),
    ).toBeInTheDocument();
    expect(screen.getByText('root: component "stack" → "Stack"')).toBeInTheDocument();
    expect(screen.getByText("A dark hero with a headline")).toBeInTheDocument();
    const [url, init] = fetch.mock.calls.find(([u]) => String(u).includes("/ai/build/")) as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/sites/site_1/ai/build/page_1");
    expect(JSON.parse(String(init.body))).toEqual({ message: "A dark hero with a headline" });
    await waitFor(() => expect(screen.getByRole("button", { name: "Build" })).toBeDisabled());
  });

  it("words a refusal before the stream starts", async () => {
    serve(() => Response.json({ error: "ai_budget", message: "used up" }, { status: 429 }));
    render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    fireEvent.change(await screen.findByLabelText("What should the page have?"), {
      target: { value: "Anything" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(
      await screen.findByText(/Today's AI commands for this site are used up/),
    ).toBeInTheDocument();
  });

  it("aims the brief at the part picked in the preview, until it is cleared (RFC-0020 §6)", async () => {
    const fetch = serve(() =>
      ndjson([
        { type: "done", rev: 2, steps: 1, refused: 0, usage: { inputTokens: 1, outputTokens: 1 } },
      ]),
    );
    const cleared = vi.fn();
    render(
      wrap(
        <BuildChat
          siteId="site_1"
          pageId="page_1"
          scope={{
            sectionId: "sec_hero00001",
            componentId: "cta",
            label: "Button “cta” in section 2",
          }}
          onClearScope={cleared}
        />,
      ),
    );
    expect(await screen.findByText("Changing Button “cta” in section 2")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("What should the page have?"), {
      target: { value: "Make it say Start free" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Build" }));
    expect(await screen.findByText("1 steps applied to the draft")).toBeInTheDocument();
    const [, init] = fetch.mock.calls.find(([u]) => String(u).includes("/ai/build/")) as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body))).toEqual({
      message: "Make it say Start free",
      scope: { sectionId: "sec_hero00001", componentId: "cta" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Change the whole page instead" }));
    expect(cleared).toHaveBeenCalledOnce();
  });

  it("suggests the model the Build eval recommends, unless the site uses it", async () => {
    serve(() => new Response(null, { status: 404 }));
    const { unmount } = render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    expect(await screen.findByTestId("build-model-hint")).toHaveTextContent(
      "Build works best with @cf/openai/gpt-oss-120b",
    );
    unmount();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          settings: { enabled: true, model: "@cf/openai/gpt-oss-120b", dailyLimit: 100, rev: 1 },
          usage: { requests: 0 },
          transport: "binding",
        }),
      ),
    );
    render(wrap(<BuildChat siteId="site_1" pageId="page_1" />));
    expect(await screen.findByLabelText("What should the page have?")).toBeInTheDocument();
    expect(screen.queryByTestId("build-model-hint")).toBeNull();
  });
});
