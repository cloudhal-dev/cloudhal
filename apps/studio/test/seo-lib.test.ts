import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@cloudhal/core-contracts";
import { describe, expect, it } from "vitest";
import {
  applySeo,
  cleanSeo,
  descriptionStatus,
  editImageRef,
  previewImageUrl,
  SEO_LIMITS,
  searchBreadcrumb,
  titleStatus,
  truncateForSearch,
  validateCanonical,
  validateImageRef,
  validateImageSrc,
  validateSeo,
} from "../src/lib/seo.ts";

const page = (seo?: Page["seo"]): Page => ({
  schemaVersion: 1,
  id: "page_about0001",
  siteId: "site_demo00001",
  path: "/about",
  title: "About",
  locale: "en",
  status: "draft",
  sections: [],
  ...(seo ? { seo } : {}),
  rev: 1,
  createdAt: "2026-10-08T09:00:00Z",
  updatedAt: "2026-10-08T09:00:00Z",
});

describe("limits", () => {
  it("match the contracts", () => {
    const schemas = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../packages/core-contracts/schemas",
    );
    const read = (name: string) => JSON.parse(readFileSync(path.join(schemas, name), "utf8"));
    const seo = read("page.schema.json").$defs.Seo.properties;
    const image = read("common.schema.json").$defs.ImageRef.properties;
    expect(SEO_LIMITS.titleMax).toBe(seo.title.maxLength);
    expect(SEO_LIMITS.descriptionMax).toBe(seo.description.maxLength);
    expect(SEO_LIMITS.canonicalMax).toBe(seo.canonical.maxLength);
    expect(SEO_LIMITS.srcMax).toBe(image.src.maxLength);
    expect(SEO_LIMITS.altMax).toBe(image.alt.maxLength);
  });
});

describe("cover image sources (the renderer's safeSrc, stricter)", () => {
  it("accepts https URLs and site paths", () => {
    expect(validateImageSrc("https://cdn.example.com/a.jpg")).toBeUndefined();
    expect(validateImageSrc("  /images/cover.jpg ")).toBeUndefined();
  });
  it("refuses everything the published site would drop, and plain http", () => {
    expect(validateImageSrc("")).toBe("required");
    expect(validateImageSrc("http://cdn.example.com/a.jpg")).toBe("insecure");
    expect(validateImageSrc("javascript:alert(1)")).toBe("invalid");
    expect(validateImageSrc("data:image/png;base64,AAAA")).toBe("invalid");
    expect(validateImageSrc("//evil.example/a.png")).toBe("invalid");
    expect(validateImageSrc("images/a.png")).toBe("invalid");
    expect(validateImageSrc("https://user:pw@cdn.example/a.png")).toBe("invalid");
    expect(validateImageSrc("/a b.png")).toBe("invalid");
    expect(validateImageSrc(`/${"a".repeat(SEO_LIMITS.srcMax)}`)).toBe("tooLong");
  });
  it("requires alt text once an image is set", () => {
    expect(validateImageRef(undefined)).toEqual({});
    expect(validateImageRef({ src: "/a.jpg", alt: "  " })).toEqual({ alt: "required" });
    expect(validateImageRef({ src: "", alt: "A cat" })).toEqual({ src: "required" });
    expect(validateImageRef({ src: "/a.jpg", alt: "A cat" })).toEqual({});
  });
  it("edits keep the ImageRef valid for the contract", () => {
    expect(editImageRef(undefined, { src: "/a.jpg" })).toEqual({ src: "/a.jpg", alt: "" });
    // Clearing both fields removes the image (the contract has no empty src).
    expect(editImageRef({ src: "/a.jpg", alt: "" }, { src: "" })).toBeUndefined();
    // A new source drops dimensions measured for the old one.
    expect(
      editImageRef({ src: "/a.jpg", alt: "A", width: 10, height: 5 }, { src: "/b.jpg" }),
    ).toEqual({ src: "/b.jpg", alt: "A" });
    expect(editImageRef({ src: "/a.jpg", alt: "A", width: 10, height: 5 }, { alt: "B" })).toEqual({
      src: "/a.jpg",
      alt: "B",
      width: 10,
      height: 5,
    });
  });
  it("loads site paths from the primary domain", () => {
    expect(previewImageUrl("/a.jpg", "example.com")).toBe("https://example.com/a.jpg");
    expect(previewImageUrl("/a.jpg", undefined)).toBe("/a.jpg");
    expect(previewImageUrl("https://cdn.example/a.jpg", "example.com")).toBe(
      "https://cdn.example/a.jpg",
    );
    expect(previewImageUrl("javascript:alert(1)", "example.com")).toBeUndefined();
  });
});

describe("canonical URLs", () => {
  it("are empty or absolute", () => {
    expect(validateCanonical("")).toBeUndefined();
    expect(validateCanonical("https://example.com/original")).toBeUndefined();
    expect(validateCanonical("/about")).toBe("invalid");
    expect(validateCanonical("example.com/about")).toBe("invalid");
    expect(validateCanonical("https://example")).toBe("invalid");
    expect(validateCanonical("ftp://example.com/a")).toBe("invalid");
    expect(validateCanonical(`https://example.com/${"a".repeat(2048)}`)).toBe("tooLong");
  });
});

describe("page seo object", () => {
  it("keeps only what is set and drops an empty object", () => {
    const withTitle = applySeo(page(), { title: "About us" });
    expect(withTitle.seo).toEqual({ title: "About us" });
    expect(applySeo(withTitle, { title: "" }).seo).toBeUndefined();
    expect(applySeo(page(), { noindex: true }).seo).toEqual({ noindex: true });
    expect(applySeo(page({ noindex: true }), { noindex: false })).not.toHaveProperty("seo");
  });
  it("trims before saving", () => {
    expect(cleanSeo(page({ title: "  About ", description: "   " })).seo).toEqual({
      title: "About",
    });
  });
  it("validates against the contract limits", () => {
    expect(validateSeo(undefined)).toEqual({});
    expect(
      validateSeo({ title: "x".repeat(301), description: "y".repeat(501), canonical: "/x" }),
    ).toEqual({ title: "tooLong", description: "tooLong", canonical: "invalid" });
  });
});

describe("search result preview", () => {
  it("cuts long descriptions at a word boundary, never past 160 characters", () => {
    const text = `${"word ".repeat(40)}end`;
    const { text: cut, truncated } = truncateForSearch(text);
    expect(truncated).toBe(true);
    expect(cut.length).toBeLessThanOrEqual(160);
    expect(cut.endsWith("word…")).toBe(true);
    expect(truncateForSearch("Short and sweet.")).toEqual({
      text: "Short and sweet.",
      truncated: false,
    });
    // One long word is cut mid-word rather than dropped.
    expect(truncateForSearch("x".repeat(200)).text).toHaveLength(160);
  });
  it("grades lengths", () => {
    expect(descriptionStatus(undefined)).toBe("missing");
    expect(descriptionStatus("Too short.")).toBe("short");
    expect(descriptionStatus("x".repeat(120))).toBe("good");
    expect(descriptionStatus("x".repeat(161))).toBe("long");
    expect(titleStatus("x".repeat(61))).toBe("long");
    expect(titleStatus("About")).toBe("good");
  });
  it("shows the address like a search result, preferring a valid canonical", () => {
    expect(searchBreadcrumb("example.com", "/posts/hello")).toBe("example.com › posts › hello");
    expect(searchBreadcrumb(undefined, "/posts/hello")).toBe("posts › hello");
    expect(searchBreadcrumb("example.com", "/about", "https://other.org/orig")).toBe(
      "other.org › orig",
    );
    expect(searchBreadcrumb("example.com", "/about", "not a url")).toBe("example.com › about");
  });
});
