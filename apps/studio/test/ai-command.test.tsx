/**
 * "Ask AI" (RFC-0016 §3): a command runs on the selection, the answer streams in, then shows as a
 * diff; Replace puts it into the editor through the selection, refused when the text changed;
 * server refusals are worded.
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiCommandDialog, cleanAiOutput } from "../src/components/AiCommandDialog.tsx";
import { wrap } from "./roles-fixtures.tsx";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stream(chunks: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c));
        controller.close();
      },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8" } },
  );
}

function serve(answer: () => Response) {
  const fn = vi.fn(async (_url: string, _init?: RequestInit) => answer());
  vi.stubGlobal("fetch", fn);
  return fn;
}

const open = (replace: (m: string) => boolean, onClose = vi.fn()) => {
  render(
    wrap(
      <AiCommandDialog
        siteId="site_1"
        nodeId="entry_1"
        pageLocale="tr"
        selection={{ markdown: "Uzun ve dağınık bir cümle.", replace }}
        onClose={onClose}
      />,
    ),
  );
  return onClose;
};

describe("Ask AI", () => {
  it("streams the answer, shows it as a diff and replaces the selection", async () => {
    const fetch = serve(() => stream(["```markdown\nKısa ", "bir cümle.\n```"]));
    const replace = vi.fn(() => true);
    const onClose = open(replace);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    await waitFor(() => expect(document.querySelector("[data-ai-result]")).not.toBeNull());
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/sites/site_1/ai/commands");
    expect(JSON.parse(String(init.body))).toEqual({
      command: "improve",
      nodeId: "entry_1",
      text: "Uzun ve dağınık bir cümle.",
    });
    expect(document.querySelector("[data-ai-result] ins")?.textContent).toContain("Kısa");
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    expect(replace).toHaveBeenCalledWith("Kısa bir cümle.");
    expect(onClose).toHaveBeenCalled();
  });

  it("refuses to replace text that changed meanwhile", async () => {
    serve(() => stream(["Yeni metin."]));
    const onClose = open(() => false);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    const replace = await screen.findByRole("button", { name: "Replace" });
    await waitFor(() => expect(replace).toBeEnabled());
    fireEvent.click(replace);
    expect(
      await screen.findByText(
        "The selected text changed while AI was working. Select it again and retry.",
      ),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("words the server's refusals", async () => {
    serve(() =>
      Response.json(
        { error: "ai_budget", message: "today's AI commands for this site are used up" },
        { status: 429 },
      ),
    );
    open(() => true);
    fireEvent.click(await screen.findByRole("button", { name: "Run" }));
    expect(
      await screen.findByText(
        "Today's AI commands for this site are used up. An Administrator can raise the daily limit in Settings › AI.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace" })).toBeDisabled();
  });

  it("strips a fence around the whole answer, nothing else", () => {
    expect(cleanAiOutput("```md\n# Title\n\nText\n```")).toBe("# Title\n\nText");
    expect(cleanAiOutput("Text with ```code``` inside")).toBe("Text with ```code``` inside");
    expect(cleanAiOutput("  plain  \n")).toBe("plain");
  });
});
