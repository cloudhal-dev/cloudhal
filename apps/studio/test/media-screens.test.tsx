/**
 * The media library in Studio (DESIGN.md §2u, RFC-0004 §8): the library, the upload queue (alt
 * text before upload, tickets then streamed PUTs, per-file errors), a file's page (alt required
 * before save, gated danger zone) and the picker that writes `assetId` into an image slot.
 */
import type { Asset, ContentEntry, Site } from "@cloudhal/core-contracts";
import { makePng } from "@cloudhal/core-ts/media/fixtures";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AssetPickerDialog } from "../src/components/MediaPicker.tsx";
import { UploadDialog } from "../src/components/MediaUpload.tsx";
import type { AssetDetail, AssetListItem, UploadResult } from "../src/lib/api.ts";
import { putUpload } from "../src/lib/uploads.ts";
import { ArticleEditorPage } from "../src/routes/ArticleEditorPage.tsx";
import { AssetPage } from "../src/routes/AssetPage.tsx";
import { MediaPage } from "../src/routes/MediaPage.tsx";
import { asRole, bodyOf, on, type Route, serve, wrap } from "./roles-fixtures.tsx";

vi.mock("@tanstack/react-router", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@tanstack/react-router")>()),
  useParams: () => ({ siteId: "site_1", assetId: "asset_photo01", entryId: "entry_1" }),
  useNavigate: () => vi.fn(),
  useSearch: () => ({}),
}));
vi.mock("../src/components/EditorPreview.tsx", () => ({ EditorPreview: () => null }));
// The bytes' PUT is XMLHttpRequest (progress); here it answers like the server would.
vi.mock("../src/lib/uploads.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/uploads.ts")>()),
  putUpload: vi.fn(),
}));

const SITE: Site = {
  schemaVersion: 1,
  id: "site_1",
  projectId: "proj_1",
  name: "Demo",
  slug: "demo",
  defaultLocale: "en",
  locales: ["en"],
  domains: [{ hostname: "example.com", primary: true }],
  pageIds: [],
  theme: { name: "blog" },
  rev: 1,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
};

const SHA = "ab".repeat(32);
const asset = (patch: Partial<Asset> = {}): Asset => ({
  schemaVersion: 1,
  id: "asset_photo01",
  siteId: "site_1",
  kind: "image",
  mediaType: "image/jpeg",
  bytes: 482_000,
  sha256: SHA,
  slug: "bosphorus-at-dawn",
  storage: { kind: "blob" },
  image: { width: 1200, height: 800 },
  alt: { en: "Ferries crossing the Bosphorus at dawn" },
  status: "active",
  uploadedBy: { kind: "human", id: "user_owner0001", name: "Halil" },
  source: { kind: "upload", filename: "Bosphorus at dawn.jpg" },
  rev: 2,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T09:00:00Z",
  ...patch,
});
const item = (a: Asset, usage = 0): AssetListItem => ({
  asset: a,
  url: `/media/${a.sha256.slice(0, 16)}/${a.slug}.jpg`,
  usage,
});
const PHOTO = asset();
const NO_ALT = asset({
  id: "asset_chart001",
  sha256: "cd".repeat(32),
  slug: "chart",
  mediaType: "image/png",
  alt: undefined,
  source: { kind: "upload", filename: "chart.png" },
});
const PDF = asset({
  id: "asset_paper001",
  kind: "document",
  mediaType: "application/pdf",
  sha256: "ef".repeat(32),
  slug: "paper",
  image: undefined,
  alt: undefined,
  title: { en: "Annual report" },
  source: { kind: "upload", filename: "report.pdf" },
});

const siteRoute = on("GET", "/api/sites/site_1", { status: 200, body: SITE });
const listRoute = (items: AssetListItem[]): Route =>
  on("GET", "/api/sites/site_1/assets", { status: 200, body: { assets: items } });

beforeEach(() => {
  vi.mocked(putUpload).mockReset();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const calls = (fn: ReturnType<typeof serve>, path: string) =>
  fn.mock.calls
    .map(([u, i]) => ({ url: String(u), init: i as RequestInit | undefined }))
    .filter((c) => c.url.startsWith(path));

describe("media library (§2u)", { timeout: 45_000 }, () => {
  it("shows tiles with their state, filters through the API, and switches to the table", async () => {
    const fetch = serve(
      ...asRole("editor"),
      siteRoute,
      listRoute([item(PHOTO, 2), item(NO_ALT), item(PDF)]),
    );
    render(wrap(<MediaPage />));
    const tiles = await screen.findAllByTestId("media-tile");
    expect(tiles).toHaveLength(3);
    const photo = tiles[0] as HTMLElement;
    expect(within(photo).getByText("Bosphorus at dawn.jpg")).toBeInTheDocument();
    expect(photo).toHaveAttribute("href", "/sites/site_1/media/asset_photo01");
    expect(within(photo).getByText("Used in 2 places")).toBeInTheDocument();
    // The image without alt text says so; the PDF has its title and kind instead of a picture.
    expect((tiles[1] as HTMLElement).querySelector('[data-badge="missing-alt"]')).not.toBeNull();
    expect(within(tiles[2] as HTMLElement).getByText("Annual report")).toBeInTheDocument();
    // Retired files are hidden by default; the library asks for active ones.
    expect(calls(fetch, "/api/sites/site_1/assets")[0]?.url).toContain("status=active");

    fireEvent.click(screen.getByRole("tab", { name: /List/ }));
    const rows = await screen.findAllByRole("row");
    expect(rows.length).toBe(4); // header + 3
    expect(screen.getByText("Annual report")).toBeInTheDocument();
  });

  it("says when the library is empty and offers the upload", async () => {
    serve(...asRole("editor"), siteRoute, listRoute([]));
    render(wrap(<MediaPage />));
    expect(await screen.findByText("No files yet")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: "Upload" }).length).toBeGreaterThan(0);
  });

  it("uploads stay with Contributors and above; the library says why when they can't", async () => {
    // Every role uploads today (Contributor included); a person without the ability sees why.
    serve(
      on("GET", "/api/me", {
        status: 200,
        body: {
          actor: { kind: "human", id: "user_x", name: "X" },
          role: "contributor",
          member: true,
          scopes: ["site:read"],
          can: { "assets.upload": false },
        },
      }),
      siteRoute,
      listRoute([item(PHOTO)]),
    );
    render(wrap(<MediaPage />));
    // Kumo re-renders a disabled, titled button inside its reason's tooltip: query it again.
    await screen.findByTestId("media-upload");
    await waitFor(() => expect(screen.getByTestId("media-upload")).toBeDisabled());
  });
});

describe("upload queue (§2u, RFC-0004 §5.5)", { timeout: 45_000 }, () => {
  const png = () =>
    new File([makePng({ width: 8, height: 8 }) as BlobPart], "dot.png", { type: "image/png" });

  it("waits for alt text, asks for tickets, streams each file and reports each result", async () => {
    const result: UploadResult = {
      ...item(asset({ id: "asset_dot00001" })),
      existing: false,
      warnings: [],
    };
    vi.mocked(putUpload).mockResolvedValue(result);
    const fetch = serve(
      ...asRole("editor"),
      on("POST", "/api/sites/site_1/assets/uploads", {
        status: 201,
        body: {
          files: [
            {
              index: 0,
              filename: "dot.png",
              uploadId: "upl_abc123",
              url: "/api/sites/site_1/assets/uploads/upl_abc123?sig=x",
              method: "PUT",
              headers: { "content-type": "image/png" },
              expiresAt: "2026-10-08T10:15:00Z",
            },
          ],
        },
      }),
    );
    const html = new File(["<html></html>"], "page.html", { type: "text/html" });
    render(
      wrap(
        <UploadDialog
          siteId="site_1"
          open
          onOpenChange={() => {}}
          initialFiles={[png(), html]}
          accept="image/*"
        />,
      ),
    );
    // The HTML file is refused before anything is sent, in words.
    expect(await screen.findByText(/This file type isn't accepted/)).toBeInTheDocument();
    const primary = await screen.findByTestId("upload-primary");
    await waitFor(() => expect(primary).toHaveTextContent("Upload 1 file"));
    expect(primary).toBeDisabled();
    expect(screen.getByText("Describe the image, or mark it decorative.")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("upload-alt"), { target: { value: "A dot" } });
    await waitFor(() => expect(primary).toBeEnabled());
    fireEvent.click(primary);
    await waitFor(() => expect(screen.getByText("Uploaded")).toBeInTheDocument());
    // One ticket request with the checks the server repeats; the bytes went to that ticket.
    const sent = bodyOf(fetch, "POST", "/api/sites/site_1/assets/uploads") as {
      files: { filename: string; mediaType: string; alt: string; sha256: string; bytes: number }[];
    };
    expect(sent.files).toHaveLength(1);
    expect(sent.files[0]).toMatchObject({
      filename: "dot.png",
      mediaType: "image/png",
      alt: "A dot",
    });
    expect(sent.files[0]?.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(vi.mocked(putUpload).mock.calls[0]?.[0]).toMatchObject({ uploadId: "upl_abc123" });
    expect(screen.getByTestId("upload-primary")).toHaveTextContent("Done");
  });

  it("shows the server's refusals per file and lets decorative images through without alt", async () => {
    const fetch = serve(
      ...asRole("editor"),
      on("POST", "/api/sites/site_1/assets/uploads", {
        status: 201,
        body: {
          files: [
            {
              index: 0,
              filename: "dot.png",
              error: { code: "svg_unsafe", message: "script elements (1)" },
            },
          ],
        },
      }),
    );
    render(
      wrap(
        <UploadDialog
          siteId="site_1"
          open
          onOpenChange={() => {}}
          initialFiles={[png()]}
          accept="image/*"
        />,
      ),
    );
    const primary = await screen.findByTestId("upload-primary");
    await waitFor(() => expect(primary).toHaveTextContent("Upload 1 file"));
    fireEvent.click(screen.getByText(/^Decorative — /));
    await waitFor(() => expect(primary).toBeEnabled());
    fireEvent.click(primary);
    expect(
      await screen.findByText(
        /SVG files can't contain scripts, event handlers or external references/,
      ),
    ).toBeInTheDocument();
    const sent = bodyOf(fetch, "POST", "/api/sites/site_1/assets/uploads") as {
      files: { decorative?: boolean; alt?: string }[];
    };
    expect(sent.files[0]).toMatchObject({ decorative: true });
    expect(sent.files[0]?.alt).toBeUndefined();
    expect(putUpload).not.toHaveBeenCalled();
  });
});

const detail = (a: Asset, uses: AssetDetail["uses"] = [], editable = true): AssetDetail => ({
  ...item(a, new Set(uses.map((u) => u.nodeId)).size),
  checksumUrl: `${item(a).url}.sha256`,
  uses,
  blob: { state: "stored" },
  editable,
});

describe("a file's page (§2u)", { timeout: 45_000 }, () => {
  it("requires alt text for images before saving; decorative saves without it", async () => {
    const fetch = serve(
      ...asRole("editor"),
      siteRoute,
      on("GET", "/api/sites/site_1/assets/asset_photo01", { status: 200, body: detail(PHOTO) }),
      on("PUT", "/api/sites/site_1/assets/asset_photo01", (init) => ({
        status: 200,
        body: { ...PHOTO, rev: 3, ...JSON.parse(String(init?.body)) },
      })),
    );
    render(wrap(<AssetPage />));
    const alt = await screen.findByTestId("asset-alt");
    fireEvent.change(alt, { target: { value: "" } });
    fireEvent.click(screen.getByTestId("save"));
    expect(
      await screen.findByText("Describe the image in the default language, or mark it decorative."),
    ).toBeInTheDocument();
    expect(
      calls(fetch, "/api/sites/site_1/assets/asset_photo01").some((c) => c.init?.method === "PUT"),
    ).toBe(false);
    fireEvent.click(screen.getByTestId("asset-decorative"));
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", "/api/sites/site_1/assets/asset_photo01")).toMatchObject({
        rev: 2,
        alt: null,
        decorative: true,
        slug: "bosphorus-at-dawn",
      }),
    );
  });

  it("lists where it is used and refuses to delete while it is; takedown is the Owner's", async () => {
    serve(
      ...asRole("editor"),
      siteRoute,
      on("GET", "/api/sites/site_1/assets/asset_photo01", {
        status: 200,
        body: detail(PHOTO, [
          {
            nodeId: "entry_1",
            nodeKind: "contentEntry",
            field: "coverImage",
            title: "Ferries at dawn",
            path: "/posts/ferries",
          },
        ]),
      }),
    );
    render(wrap(<AssetPage />));
    const link = await screen.findByRole("link", { name: "Ferries at dawn" });
    expect(link).toHaveAttribute("href", "/sites/site_1/articles/entry_1");
    expect(screen.getByText("Cover image")).toBeInTheDocument();
    // In use: Delete stays, disabled (its reason is the tooltip); takedown is the Owner's.
    expect(screen.getByTestId("asset-delete")).toBeDisabled();
    await waitFor(() => expect(screen.getByTestId("asset-takedown")).toBeDisabled());
    expect(screen.getByTestId("asset-retire")).toBeEnabled();
  });

  it("someone else's file is read-only for a Contributor, with the reason", async () => {
    serve(
      ...asRole("contributor"),
      siteRoute,
      on("GET", "/api/sites/site_1/assets/asset_photo01", {
        status: 200,
        body: detail(PHOTO, [], false),
      }),
    );
    render(wrap(<AssetPage />));
    expect(await screen.findByTestId("view-only")).toHaveTextContent(
      "This file was added by someone else.",
    );
    expect(screen.getByTestId("asset-retire")).toBeDisabled();
    expect(screen.getByTestId("save")).toBeDisabled();
  });

  it("the Owner takes a file down with a reason", async () => {
    const fetch = serve(
      ...asRole("owner"),
      siteRoute,
      on("GET", "/api/sites/site_1/assets/asset_photo01", { status: 200, body: detail(PHOTO) }),
      on("POST", "/api/sites/site_1/assets/asset_photo01/purge", {
        status: 200,
        body: { asset: { ...PHOTO, status: "retired" }, status: 410 },
      }),
    );
    render(wrap(<AssetPage />));
    await screen.findByTestId("asset-takedown");
    await waitFor(() => expect(screen.getByTestId("asset-takedown")).toBeEnabled());
    fireEvent.click(screen.getByTestId("asset-takedown"));
    const confirm = await screen.findByTestId("takedown-confirm");
    fireEvent.click(confirm);
    expect(await screen.findByText("Say why the file is taken down.")).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("takedown-reason"), {
      target: { value: "Copyright notice" },
    });
    fireEvent.click(confirm);
    await waitFor(() =>
      expect(bodyOf(fetch, "POST", "/api/sites/site_1/assets/asset_photo01/purge")).toEqual({
        reason: "Copyright notice",
        legal: false,
      }),
    );
  });
});

describe("media picker (§2u)", { timeout: 45_000 }, () => {
  it("lists active images and hands the chosen one back", async () => {
    const fetch = serve(...asRole("editor"), listRoute([item(PHOTO), item(NO_ALT)]));
    const onPick = vi.fn();
    render(
      wrap(
        <AssetPickerDialog
          siteId="site_1"
          defaultLocale="en"
          open
          onOpenChange={() => {}}
          onPick={onPick}
        />,
      ),
    );
    const tiles = await screen.findAllByTestId("picker-tile");
    expect(tiles).toHaveLength(2);
    const url = calls(fetch, "/api/sites/site_1/assets")[0]?.url ?? "";
    expect(url).toContain("kind=image");
    expect(url).toContain("status=active");
    expect(screen.getByTestId("picker-use")).toBeDisabled();
    fireEvent.click(tiles[0] as HTMLElement);
    expect(tiles[0]).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByTestId("picker-use"));
    expect(onPick).toHaveBeenCalledWith(item(PHOTO));
  });

  it("the article's cover image is picked from the library and saved as assetId", async () => {
    const entry: ContentEntry = {
      schemaVersion: 1,
      id: "entry_1",
      siteId: "site_1",
      collection: "posts",
      slug: "hello",
      locale: "en",
      status: "draft",
      title: "Hello",
      body: { format: "markdown", value: "" },
      fields: {},
      tags: [],
      author: { kind: "human", id: "user_editor001", name: "Ece" },
      rev: 1,
      createdAt: "2026-10-08T08:00:00Z",
      updatedAt: "2026-10-08T08:00:00Z",
    };
    const fetch = serve(
      ...asRole("editor"),
      siteRoute,
      on("GET", "/api/sites/site_1/entries/entry_1", { status: 200, body: entry }),
      on("PUT", "/api/sites/site_1/entries/entry_1", (init) => ({
        status: 200,
        body: { ...JSON.parse(String(init?.body)), rev: 2 },
      })),
      on("GET", "/api/sites/site_1/assets/asset_photo01", { status: 200, body: detail(PHOTO) }),
      listRoute([item(PHOTO)]),
    );
    render(wrap(<ArticleEditorPage />));
    fireEvent.click(await screen.findByTestId("cover-choose"));
    fireEvent.click(await screen.findByTestId("picker-tile"));
    fireEvent.click(screen.getByTestId("picker-use"));
    // The slot names the file and uses the file's own alt text unless this use overrides it.
    await waitFor(() =>
      expect(screen.getByTestId("cover-asset")).toHaveTextContent("Bosphorus at dawn.jpg"),
    );
    expect(
      screen.getByText(
        "Leave empty to use the file's own: “Ferries crossing the Bosphorus at dawn”.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("save"));
    await waitFor(() =>
      expect(bodyOf(fetch, "PUT", "/api/sites/site_1/entries/entry_1")?.coverImage).toEqual({
        assetId: "asset_photo01",
        src: `/media/${SHA.slice(0, 16)}/bosphorus-at-dawn.jpg`,
        alt: "",
        width: 1200,
        height: 800,
      }),
    );
  });
});
