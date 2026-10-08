import { Toasty, TooltipProvider } from "@cloudhal/ui";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../src/i18n/index.tsx";
import { RedirectsPage } from "../src/routes/RedirectsPage.tsx";
import { TermEditorPage } from "../src/routes/TermEditorPage.tsx";
import { type Call, JS, redirect, serve, taxonomyRoutes } from "./taxonomy-fixtures.ts";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", termId: "term_js000001" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));

function wrap(children: ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <I18nProvider initialLocale="en">
      <QueryClientProvider client={qc}>
        <TooltipProvider>
          <Toasty>{children}</Toasty>
        </TooltipProvider>
      </QueryClientProvider>
    </I18nProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const JS_WITH_HISTORY = { ...JS, slugHistory: ["js"] as [string] };
const editorRoutes = () =>
  taxonomyRoutes({
    "/api/sites/site_1/terms/term_js000001": {
      term: JS_WITH_HISTORY,
      usage: { total: 2, published: 2 },
      redirects: [redirect()],
    },
  });
const puts = (calls: Call[]) => calls.filter((c) => c.method === "PUT");

describe("term editor", () => {
  it("requires a name in the default language and saves nothing without one", async () => {
    const calls = serve(editorRoutes());
    render(wrap(<TermEditorPage />));
    const name = await screen.findByTestId("term-name");
    fireEvent.change(name, { target: { value: "   " } });
    fireEvent.click(screen.getByTestId("save"));
    expect(
      await screen.findByText("Enter a name in the site's default language."),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Fix the highlighted fields before saving."),
    ).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("refuses a synonym that already names another term (invariant 12)", async () => {
    const calls = serve(editorRoutes());
    render(wrap(<TermEditorPage />));
    const synonyms = await screen.findByTestId("term-altnames");
    fireEvent.change(synonyms, { target: { value: "L.L.M." } });
    fireEvent.keyDown(synonyms, { key: "Enter" });
    fireEvent.click(screen.getByTestId("save"));
    expect(
      await screen.findByText("“L.L.M.” already names LLM. A synonym can't point to two terms."),
    ).toBeInTheDocument();
    expect(puts(calls)).toHaveLength(0);
  });

  it("saves the introduction, position and SEO, cleaned, and never the slug", async () => {
    const calls = serve(editorRoutes(), (call) =>
      call.method === "PUT"
        ? {
            body: {
              term: { ...(call.body ?? {}), rev: Number(call.body?.rev) + 1 },
              snapshot: { id: "snap_9" },
            },
          }
        : undefined,
    );
    render(wrap(<TermEditorPage />));
    fireEvent.change(await screen.findByTestId("term-intro"), {
      target: { value: "  All about **JavaScript**.  " },
    });
    fireEvent.change(screen.getByTestId("term-position"), { target: { value: "4" } });
    fireEvent.change(screen.getByTestId("seo-description"), {
      target: { value: "JavaScript articles: runtimes, frameworks and the web platform today." },
    });
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() => expect(puts(calls)).toHaveLength(1));
    const sent = puts(calls)[0]?.body;
    expect(sent?.slug).toBe("javascript");
    expect(sent?.position).toBe(4);
    expect(sent?.labels).toEqual({
      en: {
        name: "JavaScript",
        altNames: ["JS"],
        description: "All about **JavaScript**.",
        seo: {
          description: "JavaScript articles: runtimes, frameworks and the web platform today.",
        },
      },
    });
    expect(
      await screen.findByText("One change, one snapshot. It goes live with the next publish."),
    ).toBeInTheDocument();
  });

  it("shows the slug history read-only, with the redirect each old slug left", async () => {
    serve(editorRoutes());
    render(wrap(<TermEditorPage />));
    const history = await screen.findByTestId("slug-history");
    expect(history).toHaveTextContent("/tag/js/tag/javascript301");
    expect(within(history).queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("shows the archive's indexing status", async () => {
    serve(editorRoutes());
    render(wrap(<TermEditorPage />));
    expect(
      await screen.findByText(
        "/tag/javascript has 2 of the 3 published articles it needs; until then it is served with noindex, follow.",
      ),
    ).toBeInTheDocument();
  });
});

describe("redirects screen", () => {
  const list = [
    redirect(),
    redirect({
      id: "redir_2",
      from: "/docs",
      to: "https://docs.example.com/start",
      reason: "manual",
      source: undefined,
      note: "Docs moved",
    }),
    redirect({
      id: "redir_3",
      from: "/tag/llms",
      to: "/tag/llm",
      reason: "merge",
      source: { kind: "term", id: "term_llms0001" },
    }),
  ].map((r) => {
    const { source, ...rest } = r;
    return source ? { ...rest, source } : rest;
  });
  const routes = () =>
    taxonomyRoutes({
      "/api/sites/site_1/redirects": list,
      "/api/sites/site_1/pages": [{ id: "page_1", path: "/about", title: "About" }],
    });

  it("lists redirects with their source and marks external targets", async () => {
    serve(routes());
    render(wrap(<RedirectsPage />));
    const js = await waitFor(() => {
      const row = document.querySelector('tr[data-redirect-id="redir_1"]');
      expect(row).not.toBeNull();
      return row as HTMLElement;
    });
    expect(within(js).getByTestId("redirect-source")).toHaveTextContent("Slug change");
    await waitFor(() => expect(js).toHaveTextContent("JavaScript"));
    const docs = document.querySelector('tr[data-redirect-id="redir_2"]') as HTMLElement;
    expect(docs).toHaveTextContent("External");
    expect(within(docs).getByTestId("redirect-source")).toHaveTextContent("Manual");
    const merge = document.querySelector('tr[data-redirect-id="redir_3"]') as HTMLElement;
    expect(within(merge).getByTestId("redirect-source")).toHaveTextContent("Merge");
  });

  it("validates per the invariants: served paths, duplicates and loops", async () => {
    const calls = serve(routes());
    render(wrap(<RedirectsPage />));
    fireEvent.click(await screen.findByTestId("new-redirect"));
    const from = await screen.findByTestId("redirect-from");
    const to = screen.getByTestId("redirect-to");
    fireEvent.change(from, { target: { value: "/about" } });
    fireEvent.change(to, { target: { value: "/" } });
    fireEvent.click(screen.getByTestId("redirect-submit"));
    expect(await screen.findByText(/The site serves this address/)).toBeInTheDocument();
    fireEvent.change(from, { target: { value: "/docs" } });
    expect(
      await screen.findByText(/A redirect from this address already exists/),
    ).toBeInTheDocument();
    // /tag/llm → … → back here would loop: /tag/llms redirects to /tag/llm.
    fireEvent.change(from, { target: { value: "/tag/llm" } });
    fireEvent.change(to, { target: { value: "/tag/llms" } });
    expect(
      await screen.findByText("That would loop: the target redirects back here."),
    ).toBeInTheDocument();
    fireEvent.change(to, { target: { value: "http://example.com" } });
    expect(await screen.findByText("Use https://.")).toBeInTheDocument();
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("asks for a confirmation naming the host before an external redirect", async () => {
    const calls = serve(routes(), (call) =>
      call.method === "POST"
        ? { status: 201, body: { redirect: { ...redirect(), ...call.body }, snapshot: {} } }
        : undefined,
    );
    render(wrap(<RedirectsPage />));
    fireEvent.click(await screen.findByTestId("new-redirect"));
    fireEvent.change(await screen.findByTestId("redirect-from"), {
      target: { value: "help/" },
    });
    fireEvent.change(screen.getByTestId("redirect-to"), {
      target: { value: "https://help.example.org/start" },
    });
    fireEvent.click(screen.getByTestId("redirect-submit"));
    const confirm = await screen.findByTestId("redirect-external");
    expect(within(confirm).getByTestId("external-host")).toHaveTextContent("help.example.org");
    expect(confirm).toHaveTextContent("Visitors will leave for help.example.org");
    expect(calls.filter((c) => c.method === "POST")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Redirect to help.example.org" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "POST")).toHaveLength(1));
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      from: "/help",
      to: "https://help.example.org/start",
      match: "exact",
      status: 301,
    });
  });
});
