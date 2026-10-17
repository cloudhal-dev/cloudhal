import type { Asset } from "@cloudhal/core-contracts";
import { makeJpeg, makePng } from "@cloudhal/core-ts/media/fixtures";
import { describe, expect, it } from "vitest";
import { translate } from "../src/i18n/index.tsx";
import { ASSET_EVENTS, isAssetEvent, isKnownTool } from "../src/lib/activity.ts";
import {
  assetForm,
  assetMeta,
  assetPatch,
  assetPreviewUrl,
  assetTitle,
  checkFile,
  dominantColor,
  formatSize,
  imageRefFor,
  imageRefPreviewUrl,
  leanWebp,
  needsAlt,
  readImageInfo,
  slugify,
  uploadErrorCode,
  validateAssetForm,
} from "../src/lib/media.ts";
import { editImageRef, validateImageRef } from "../src/lib/seo.ts";
import { libraryQuery } from "../src/routes/MediaPage.tsx";

const asset = (patch: Partial<Asset> = {}): Asset => ({
  schemaVersion: 1,
  id: "asset_photo01",
  siteId: "site_1",
  kind: "image",
  mediaType: "image/jpeg",
  bytes: 493_568,
  sha256: "ab".repeat(32),
  slug: "bosphorus-at-dawn",
  storage: { kind: "blob" },
  image: { width: 1200, height: 800 },
  status: "active",
  uploadedBy: { kind: "human", id: "user_1" },
  source: { kind: "upload", filename: "IMG_0042.jpg" },
  rev: 0,
  createdAt: "2026-10-08T08:00:00Z",
  updatedAt: "2026-10-08T08:00:00Z",
  ...patch,
});

describe("before an upload (RFC-0004 §5.1)", () => {
  const file = (name: string, type: string, size = 1000) => ({ name, type, size });
  it("knows the pipeline's types and caps, by declared type or extension", () => {
    expect(checkFile(file("a.png", "image/png"))).toMatchObject({
      mediaType: "image/png",
      kind: "image",
    });
    expect(checkFile(file("rides.csv", ""))).toMatchObject({ mediaType: "text/csv", kind: "data" });
    expect(checkFile(file("paper.pdf", "application/octet-stream")).kind).toBe("document");
    expect(checkFile(file("IMG_1.HEIC", "image/heic")).problem).toBe("heic");
    expect(checkFile(file("page.html", "text/html")).problem).toBe("unsupported_type");
    expect(checkFile(file("big.png", "image/png", 21 * 1024 * 1024)).problem).toBe("too_large");
    expect(checkFile(file("clip.mp4", "video/mp4", 99 * 1024 * 1024)).problem).toBeUndefined();
  });

  it("reads a photo's size and whether it carries GPS, like the server does", () => {
    expect(readImageInfo(makeJpeg({ width: 640, height: 480, gps: true }), "image/jpeg")).toEqual({
      width: 640,
      height: 480,
      gps: true,
    });
    expect(readImageInfo(makePng({ width: 3, height: 2 }), "image/png")?.gps).toBe(false);
    expect(readImageInfo(new Uint8Array([1, 2, 3]), "image/png")).toBeUndefined();
    expect(readImageInfo(new Uint8Array([1]), "application/pdf")).toBeUndefined();
  });

  it("maps the server's refusals to words, and anything else to unknown", () => {
    expect(uploadErrorCode("svg_unsafe")).toBe("svg_unsafe");
    expect(uploadErrorCode("type_mismatch")).toBe("type_mismatch");
    expect(uploadErrorCode("bad_signature")).toBe("unknown");
    expect(uploadErrorCode(undefined)).toBe("unknown");
  });
});

describe("showing files (§2u)", () => {
  it("names a file by its title, else the uploaded name, else its URL's name", () => {
    expect(assetTitle(asset({ title: { tr: "Boğaz", en: "Bosphorus" } }), "tr")).toBe("Boğaz");
    expect(assetTitle(asset({ title: { en: "Bosphorus" } }), "tr", "en")).toBe("Bosphorus");
    expect(assetTitle(asset(), "en")).toBe("IMG_0042.jpg");
    expect(assetTitle(asset({ source: { kind: "link" } }), "en")).toBe("bosphorus-at-dawn.jpg");
  });

  it("formats sizes in the person's locale", () => {
    expect(formatSize(512, "en")).toBe("512 B");
    expect(formatSize(493_568, "en")).toBe("482 KB");
    expect(formatSize(1_258_291, "tr")).toBe("1,2 MB");
    expect(assetMeta(asset(), "en")).toBe("JPEG · 1200 × 800 · 482 KB");
  });

  it("flags images without alt text unless decorative", () => {
    expect(needsAlt(asset(), "en")).toBe(true);
    expect(needsAlt(asset({ alt: { en: "Ferries" } }), "en")).toBe(false);
    expect(needsAlt(asset({ alt: { tr: "Vapurlar" } }), "en")).toBe(true);
    expect(needsAlt(asset({ decorative: true }), "en")).toBe(false);
    expect(
      needsAlt(asset({ kind: "document", mediaType: "application/pdf", image: undefined }), "en"),
    ).toBe(false);
  });

  it("previews stored images from Studio's private content route, never the public URL", () => {
    expect(assetPreviewUrl("site_1", asset())).toBe(
      "/api/sites/site_1/assets/asset_photo01/content",
    );
    expect(
      assetPreviewUrl("site_1", asset({ kind: "data", mediaType: "text/csv", image: undefined })),
    ).toBeUndefined();
  });

  it("previews an image slot from the content route when it is a library file", () => {
    expect(
      imageRefPreviewUrl(
        "site_1",
        { assetId: "asset_photo01", src: "/media/abab/x.jpg" },
        "example.com",
      ),
    ).toBe("/api/sites/site_1/assets/asset_photo01/content");
    expect(imageRefPreviewUrl("site_1", { src: "/images/a.jpg" }, "example.com")).toBe(
      "https://example.com/images/a.jpg",
    );
  });

  it("an image slot pointing at a file carries assetId, the URL and the size", () => {
    expect(imageRefFor({ asset: asset(), url: "/media/abab/x.jpg", usage: 0 }, "Here")).toEqual({
      assetId: "asset_photo01",
      src: "/media/abab/x.jpg",
      alt: "Here",
      width: 1200,
      height: 800,
    });
  });

  it("the library hides retired files unless asked, and maps its filters onto the API", () => {
    expect(libraryQuery("all", "active", "")).toEqual({ status: ["active"] });
    expect(libraryQuery("image", "unused", " dawn ")).toEqual({
      kind: ["image"],
      status: ["active"],
      unused: true,
      q: "dawn",
    });
    expect(libraryQuery("all", "missingAlt", "")).toMatchObject({ missingAlt: true });
    expect(libraryQuery("all", "agents", "")).toMatchObject({ uploadedBy: "agent" });
    expect(libraryQuery("all", "retired", "")).toEqual({ status: ["retired"] });
  });
});

describe("image slots with library files (lib/seo.ts)", () => {
  it("a library image needs no address or alt of its own", () => {
    const ref = { assetId: "asset_photo01", src: "/media/abab/x.jpg", alt: "" };
    expect(validateImageRef(ref)).toEqual({});
    expect(validateImageRef({ ...ref, alt: "x".repeat(501) })).toEqual({ alt: "tooLong" });
    // An address still needs both.
    expect(validateImageRef({ src: "", alt: "" })).toEqual({ src: "required", alt: "required" });
  });

  it("typing an address detaches the library file; alt edits keep it", () => {
    const ref = {
      assetId: "asset_photo01",
      src: "/media/abab/x.jpg",
      alt: "",
      width: 1200,
      height: 800,
    };
    expect(editImageRef(ref, { alt: "For this use" })).toEqual({ ...ref, alt: "For this use" });
    expect(editImageRef(ref, { src: "https://cdn.example.com/a.jpg" })).toEqual({
      src: "https://cdn.example.com/a.jpg",
      alt: "",
    });
  });
});

describe("the file's details form", () => {
  it("requires alt text in the default locale for images, unless decorative", () => {
    const form = assetForm(asset());
    expect(validateAssetForm(form, "image", "en")).toEqual({ alt: "required" });
    expect(validateAssetForm({ ...form, alt: { en: "Ferries" } }, "image", "en")).toEqual({});
    expect(validateAssetForm({ ...form, decorative: true }, "image", "en")).toEqual({});
    expect(validateAssetForm(form, "document", "en")).toEqual({});
  });

  it("checks the slug and the license like the contract", () => {
    const form = { ...assetForm(asset()), decorative: true };
    expect(validateAssetForm({ ...form, slug: "Not ok" }, "image", "en")).toEqual({
      slug: "invalid",
    });
    expect(
      validateAssetForm(
        { ...form, license: { kind: "spdx", id: "not a licence!" } },
        "image",
        "en",
      ),
    ).toEqual({ license: "invalid" });
    expect(
      validateAssetForm(
        { ...form, license: { kind: "url", url: "http://example.com", name: "" } },
        "image",
        "en",
      ),
    ).toEqual({ license: "invalid" });
  });

  it("sends empty texts as removals and keeps no alt on a decorative image", () => {
    const form = {
      ...assetForm(asset({ alt: { en: "Old" }, credit: "Me" })),
      title: { en: " Bosphorus ", tr: "" },
      decorative: true,
      credit: " ",
      license: { kind: "spdx" as const, id: "CC-BY-4.0" },
    };
    expect(assetPatch(form, "image")).toEqual({
      title: { en: "Bosphorus" },
      alt: null,
      caption: null,
      credit: null,
      license: { kind: "spdx", id: "CC-BY-4.0" },
      decorative: true,
      slug: "bosphorus-at-dawn",
      focal: null,
    });
    // RFC-0028: the focal point travels with images only.
    expect(assetPatch({ ...form, focal: { x: 0.2, y: 0.7 } }, "image").focal).toEqual({
      x: 0.2,
      y: 0.7,
    });
    expect("focal" in assetPatch(form, "document")).toBe(false);
  });

  it("makes URL slugs from names", () => {
    expect(slugify("Boğaz at Dawn (1)")).toBe("bogaz-at-dawn-1");
    expect(slugify("İstanbul Işıkları")).toBe("istanbul-isiklari");
  });
});

describe("Activity names media changes", () => {
  it("labels people's file events and the agents' asset tools", () => {
    expect(isAssetEvent("asset.purge")).toBe(true);
    expect(isAssetEvent("asset.unknown")).toBe(false);
    expect(translate("en", `tools.${ASSET_EVENTS["asset.purge"]}`)).toBe("Take down file");
    expect(translate("tr", `tools.${ASSET_EVENTS["asset.upload"]}`)).toBe("Dosya yükle");
    expect(isKnownTool("fetch_asset_url")).toBe(true);
    expect(translate("en", "tools.fetch_asset_url")).toBe("Add media from a URL");
  });
});

describe("dominantColor (RFC-0028)", () => {
  it("averages the visible pixels, weighted by opacity", () => {
    expect(dominantColor([255, 0, 0, 255, 0, 0, 255, 255])).toBe("#800080");
    expect(dominantColor([255, 255, 255, 255, 0, 0, 0, 0])).toBe("#ffffff");
    expect(dominantColor([10, 20, 30, 0])).toBeUndefined();
  });
});

describe("leanWebp (RFC-0028)", () => {
  it("drops the ICC profile a canvas embeds, and the extended header once nothing needs it", () => {
    const withIcc =
      "data:image/webp;base64,UklGRi4CAABXRUJQVlA4WAoAAAAgAAAAFwAADgAASUNDUMgBAAAAAAHIAAAAAAQwAABtbnRyUkdCIFhZWiAH4AABAAEAAAAAAABhY3NwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAQAA9tYAAQAAAADTLQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAlkZXNjAAAA8AAAACRyWFlaAAABFAAAABRnWFlaAAABKAAAABRiWFlaAAABPAAAABR3dHB0AAABUAAAABRyVFJDAAABZAAAAChnVFJDAAABZAAAAChiVFJDAAABZAAAAChjcHJ0AAABjAAAADxtbHVjAAAAAAAAAAEAAAAMZW5VUwAAAAgAAAAcAHMAUgBHAEJYWVogAAAAAAAAb6IAADj1AAADkFhZWiAAAAAAAABimQAAt4UAABjaWFlaIAAAAAAAACSgAAAPhAAAts9YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZmYAAPKnAAANWQAAE9AAAApbAAAAAAAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADZWUDggQAAAAFADAJ0BKhgADwA+0VajS7+koyGwCAPwGglAFYAFoPydArY4AP7d3cE4W/85vFmRhrdfDtzZEUCaWYH33ugAAAA=";
    const lean = leanWebp(withIcc);
    expect(lean.length).toBeLessThan(140);
    const bytes = atob(lean.slice("data:image/webp;base64,".length));
    expect(bytes.slice(0, 4)).toBe("RIFF");
    expect(bytes.slice(12, 16)).toBe("VP8 ");
    expect(bytes.charCodeAt(4) + bytes.charCodeAt(5) * 256).toBe(bytes.length - 8);
    expect(leanWebp("data:image/png;base64,iVBO")).toBe("data:image/png;base64,iVBO");
  });
});
