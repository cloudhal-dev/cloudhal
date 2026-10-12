/**
 * RFC-0004 §5.2–§5.4: sniffing, image headers, lossless metadata stripping, the SVG validator and
 * the upload inspection every path runs. Fixtures are synthesised (`media/fixtures.ts`).
 */
import { describe, expect, it } from "vitest";
import { InvariantError } from "../src/errors.ts";
import {
  makeAvif,
  makeGif,
  makeJpeg,
  makePng,
  makeWebp,
  PNG_1X1,
  text,
} from "../src/media/fixtures.ts";
import {
  assetRefsOf,
  canonicalImageRefs,
  checkSvg,
  inspectImage,
  inspectUpload,
  isReservedMediaPath,
  MEDIA_ROUTE,
  markdownAssetIds,
  mediaPath,
  readExif,
  slugifyFilename,
  sniff,
  stripImageMetadata,
} from "../src/media/index.ts";

async function code(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (e) {
    if (e instanceof InvariantError) return e.code;
    throw e;
  }
  throw new Error("expected a rejection");
}

const find = (hay: Uint8Array, needle: string) => {
  const n = new TextEncoder().encode(needle);
  outer: for (let i = 0; i + n.length <= hay.length; i++) {
    for (let j = 0; j < n.length; j++) if (hay[i + j] !== n[j]) continue outer;
    return i;
  }
  return -1;
};

describe("sniff", () => {
  it("recognises accepted binary formats by their magic numbers", () => {
    const type = (b: Uint8Array) => {
      const s = sniff(b);
      return s.kind === "type" ? s.mediaType : s.kind;
    };
    expect(type(makeJpeg())).toBe("image/jpeg");
    expect(type(makePng())).toBe("image/png");
    expect(type(makeWebp())).toBe("image/webp");
    expect(type(makeGif())).toBe("image/gif");
    expect(type(makeAvif())).toBe("image/avif");
    expect(type(text("%PDF-1.7\n%âãÏÓ\n"))).toBe("application/pdf");
    expect(type(text("\n\n%PDF-1.4"))).toBe("application/pdf");
    expect(type(text("ID3\u0004\u0000"))).toBe("audio/mpeg");
    expect(type(text("OggS\u0000\u0002"))).toBe("audio/ogg");
    expect(type(new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x42, 0x82, 0x84, ...text("webm")]))).toBe(
      "video/webm",
    );
    const mp4 = new Uint8Array([0, 0, 0, 24, ...text("ftypisom"), 0, 0, 2, 0, ...text("isomiso2")]);
    expect(type(mp4)).toBe("video/mp4");
    const m4a = new Uint8Array([0, 0, 0, 20, ...text("ftypM4A "), 0, 0, 0, 0, ...text("isom")]);
    expect(type(m4a)).toBe("audio/mp4");
    expect(type(text("RIFF\u0000\u0000\u0000\u0000WAVEfmt "))).toBe("audio/wav");
    expect(sniff(text("PAR1xxxx"), text("PAR1"))).toEqual({
      kind: "type",
      mediaType: "application/vnd.apache.parquet",
    });
  });

  it("refuses archives, executables, HEIC, HTML and XML", () => {
    const what = (b: Uint8Array) => {
      const s = sniff(b);
      return s.kind === "refused" ? s.what : s.kind;
    };
    expect(what(text("PK\u0003\u0004"))).toMatch(/ZIP/);
    expect(what(text("MZ\u0090\u0000"))).toMatch(/executable/);
    expect(what(new Uint8Array([0x7f, 0x45, 0x4c, 0x46, 2]))).toMatch(/executable/);
    const heic = new Uint8Array([
      0,
      0,
      0,
      24,
      ...text("ftypheic"),
      0,
      0,
      0,
      0,
      ...text("mif1heic"),
    ]);
    const h = sniff(heic);
    expect(h.kind === "refused" && h.hint).toMatch(/convert it to JPEG/);
    expect(what(text("<!DOCTYPE html><html><body>hi"))).toMatch(/web page/);
    expect(what(text("  <script>alert(1)</script>"))).toMatch(/web page/);
    expect(what(text('<?xml version="1.0"?><feed/>'))).toMatch(/XML/);
    expect(what(text("#!/bin/sh\nrm -rf /"))).toMatch(/script/);
    expect(what(text("name,html\nx,<script>alert(1)</script>"))).toMatch(/web page/);
  });

  it("classifies safe text and SVG", () => {
    expect(sniff(text("a,b\n1,2\n"))).toEqual({ kind: "text", json: false });
    expect(sniff(text('  {"a": 1}'))).toEqual({ kind: "text", json: true });
    expect(
      sniff(text('<?xml version="1.0"?>\n<!-- x -->\n<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toEqual({
      kind: "type",
      mediaType: "image/svg+xml",
    });
    expect(sniff(new Uint8Array([0x61, 0, 0x62])).kind).toBe("unknown");
    expect(sniff(new Uint8Array([0xc3, 0x28])).kind).toBe("unknown");
  });
});

describe("image headers and metadata stripping", () => {
  it("reads sizes and animation from every raster format", () => {
    expect(inspectImage(makeJpeg({ width: 3000, height: 2000 }), "image/jpeg")).toMatchObject({
      width: 3000,
      height: 2000,
      animated: false,
    });
    expect(inspectImage(makePng({ width: 64, height: 32 }), "image/png")).toMatchObject({
      width: 64,
      height: 32,
    });
    expect(inspectImage(makePng({ frames: 3 }), "image/png").animated).toBe(true);
    expect(inspectImage(makeWebp({ width: 321, height: 201 }), "image/webp")).toMatchObject({
      width: 321,
      height: 201,
      animated: false,
    });
    expect(inspectImage(makeWebp({ frames: 2 }), "image/webp").animated).toBe(true);
    expect(inspectImage(makeGif({ width: 10, height: 12, frames: 2 }), "image/gif")).toMatchObject({
      width: 10,
      height: 12,
      animated: true,
    });
    expect(inspectImage(makeAvif({ width: 800, height: 600 }), "image/avif")).toMatchObject({
      width: 800,
      height: 600,
    });
    expect(inspectImage(PNG_1X1, "image/png")).toMatchObject({ width: 1, height: 1 });
  });

  it("JPEG: drops Exif/GPS, XMP, IPTC, comments and trailers; keeps JFIF, ICC and orientation", () => {
    const original = makeJpeg({
      orientation: 6,
      gps: true,
      xmp: true,
      iptc: true,
      comment: true,
      trailer: true,
    });
    const meta = inspectImage(original, "image/jpeg").metadata;
    expect(meta).toMatchObject({ exif: true, gps: true, xmp: true, other: true, orientation: 6 });
    const stripped = stripImageMetadata(original, "image/jpeg");
    expect(stripped.byteLength).toBeLessThan(original.byteLength);
    const after = inspectImage(stripped, "image/jpeg");
    expect(after.metadata).toMatchObject({ gps: false, xmp: false, other: false, orientation: 6 });
    expect([after.width, after.height]).toEqual([640, 480]);
    for (const gone of ["ACME", "http://ns.adobe.com", "Photoshop", "shot on a phone", "TRAILER"])
      expect(find(stripped, gone), gone).toBe(-1);
    for (const kept of ["JFIF", "ICC_PROFILE"])
      expect(find(stripped, kept), kept).toBeGreaterThan(0);
    // The entropy-coded scan is byte-identical (no re-encoding).
    const scan = [0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78, 0x9a, 0xff, 0xd9];
    expect(Array.from(stripped.slice(-scan.length))).toEqual(scan);
    // Stripping is idempotent; a clean file is returned as is.
    expect(stripImageMetadata(stripped, "image/jpeg")).toEqual(stripped);
    // Upright photos need no orientation segment at all.
    const upright = stripImageMetadata(makeJpeg({ orientation: 1, gps: true }), "image/jpeg");
    expect(find(upright, "Exif")).toBe(-1);
  });

  it("PNG, WebP and GIF lose their metadata chunks and keep their image data", () => {
    const png = makePng({ text: true, exif: true });
    expect(inspectImage(png, "image/png").metadata.gps).toBe(true);
    const cleanPng = stripImageMetadata(png, "image/png");
    expect(find(cleanPng, "tEXt")).toBe(-1);
    expect(find(cleanPng, "eXIf")).toBe(-1);
    expect(find(cleanPng, "tIME")).toBe(-1);
    expect(find(cleanPng, "sRGB")).toBeGreaterThan(0);
    expect(find(cleanPng, "IDAT")).toBeGreaterThan(0);

    const webp = makeWebp({ exif: true, xmp: true });
    expect(inspectImage(webp, "image/webp").metadata).toMatchObject({
      exif: true,
      xmp: true,
      gps: true,
    });
    const cleanWebp = stripImageMetadata(webp, "image/webp");
    expect(find(cleanWebp, "EXIF")).toBe(-1);
    expect(find(cleanWebp, "XMP ")).toBe(-1);
    expect(inspectImage(cleanWebp, "image/webp").metadata).toMatchObject({
      exif: false,
      xmp: false,
    });
    // VP8X flags cleared and the RIFF size rewritten.
    const vp8x = find(cleanWebp, "VP8X");
    expect((cleanWebp[vp8x + 8] as number) & 0x0c).toBe(0);
    const riff = new DataView(cleanWebp.buffer, cleanWebp.byteOffset).getUint32(4, true);
    expect(riff + 8).toBe(cleanWebp.byteLength);

    const gif = makeGif({ comment: true, frames: 2 });
    const cleanGif = stripImageMetadata(gif, "image/gif");
    expect(find(cleanGif, "hello")).toBe(-1);
    expect(inspectImage(cleanGif, "image/gif").animated).toBe(true);
  });

  it("AVIF with Exif is refused (answer 14); a clean AVIF passes", async () => {
    expect(await code(() => stripImageMetadata(makeAvif({ exif: true }), "image/avif"))).toBe(
      "metadata_unsupported",
    );
    const clean = makeAvif();
    expect(stripImageMetadata(clean, "image/avif")).toBe(clean);
  });

  it("reads orientation and GPS from little- and big-endian TIFF", () => {
    expect(
      readExif(
        new Uint8Array([
          0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 0x12, 0x01, 3, 0, 1, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0,
        ]),
      ),
    ).toEqual({
      orientation: 8,
      gps: false,
    });
    expect(readExif(new Uint8Array([1, 2, 3]))).toEqual({ gps: false });
  });

  it("malformed images are refused, not crashed on", async () => {
    expect(await code(() => inspectImage(makeJpeg().slice(0, 30), "image/jpeg"))).toBe(
      "unsupported_type",
    );
    expect(await code(() => inspectImage(makePng().slice(0, 20), "image/png"))).toBe(
      "unsupported_type",
    );
    expect(
      await code(() => inspectImage(text("RIFF\u0004\u0000\u0000\u0000WEBP"), "image/webp")),
    ).toBe("unsupported_type");
  });
});

describe("SVG validator (validate and reject)", () => {
  const ok =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 12"><title>Logo</title><defs><linearGradient id="g"><stop offset="0" stop-color="#fff"/></linearGradient></defs><rect width="10" height="10" fill="url(#g)" style="opacity:.5"/><use href="#g"/></svg>';

  it("accepts presentation-only SVG and reads its size", () => {
    expect(checkSvg(ok)).toEqual({ ok: true, problems: [], width: 24, height: 12 });
    expect(
      checkSvg('<svg xmlns="http://www.w3.org/2000/svg" width="300px" height="80"/>'),
    ).toMatchObject({
      ok: true,
      width: 300,
      height: 80,
    });
  });

  it.each([
    [
      "script",
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      /script elements/,
    ],
    [
      "event handler",
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>',
      /event handlers/,
    ],
    [
      "javascript href",
      '<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>',
      /external references/,
    ],
    [
      "external href",
      '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://evil.example/x.png"/></svg>',
      /external references/,
    ],
    [
      "entity-encoded handler value",
      '<svg xmlns="http://www.w3.org/2000/svg"><rect fill="&#106;avascript:x"/></svg>',
      /script URLs/,
    ],
    [
      "foreignObject",
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject><div/></foreignObject></svg>',
      /foreignObject/,
    ],
    [
      "DOCTYPE/XXE",
      '<?xml version="1.0"?><!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg">&x;</svg>',
      /DTD/,
    ],
    [
      "css import",
      '<svg xmlns="http://www.w3.org/2000/svg"><style>@import url(https://x.example/a.css);</style></svg>',
      /@import/,
    ],
    [
      "css url",
      '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:url(https://x.example/t)"/></svg>',
      /external references/,
    ],
    [
      "animation",
      '<svg xmlns="http://www.w3.org/2000/svg"><a><animate attributeName="href" to="javascript:alert(1)"/></a></svg>',
      /animation elements/,
    ],
    [
      "xhtml namespace",
      '<svg xmlns="http://www.w3.org/2000/svg"><g xmlns="http://www.w3.org/1999/xhtml"><iframe/></g></svg>',
      /foreign default namespaces/,
    ],
    [
      "prefixed svg script",
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:s="http://www.w3.org/2000/svg"><metadata><s:script>1</s:script></metadata></svg>',
      /script elements/,
    ],
    ["not svg", "<html><body/></html>", /root element/],
  ])("refuses %s", (_name, source, problem) => {
    const r = checkSvg(source);
    expect(r.ok).toBe(false);
    expect(r.problems.join(", ")).toMatch(problem);
  });

  it("allows editor metadata in non-active namespaces inside <metadata>", () => {
    const inkscape =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><rdf:RDF><dc:title>x</dc:title></rdf:RDF></metadata><path d="M0 0h1"/></svg>';
    expect(checkSvg(inkscape).ok).toBe(true);
  });
});

describe("inspectUpload (§5.2)", () => {
  it("hashes, strips and sizes an agent's JPEG; original hash recorded", async () => {
    const original = makeJpeg({ orientation: 6, gps: true, width: 3000, height: 2000 });
    const r = await inspectUpload({
      bytes: original,
      declaredType: "image/jpeg",
      filename: "IMG_0001.JPG",
      actor: "agent",
    });
    expect(r).toMatchObject({
      mediaType: "image/jpeg",
      kind: "image",
      ext: "jpg",
      image: { width: 3000, height: 2000 },
    });
    expect(r.originalSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(r.sha256).not.toBe(r.originalSha256);
    expect(inspectImage(r.bytes, "image/jpeg").metadata.gps).toBe(false);
    expect(r.warnings).toEqual([]);
  });

  it("keepMetadata is for people only, with a GPS warning", async () => {
    const original = makeJpeg({ gps: true });
    const person = await inspectUpload({ bytes: original, actor: "human", keepMetadata: true });
    expect(person.bytes).toBe(original);
    expect(person.originalSha256).toBeUndefined();
    expect(person.warnings).toEqual(["metadata-kept", "gps"]);
    const agent = await inspectUpload({ bytes: original, actor: "agent", keepMetadata: true });
    expect(agent.originalSha256).toBeDefined();
  });

  it("the sniffed type decides: a PNG labelled JPEG is refused", async () => {
    const e = await inspectUpload({
      bytes: makePng(),
      declaredType: "image/jpeg",
      actor: "human",
    }).catch((x) => x);
    expect(e).toBeInstanceOf(InvariantError);
    expect(e.code).toBe("type_mismatch");
    expect(e.message).toBe("this file is a PNG, not a JPEG");
    expect(
      await code(inspectUpload({ bytes: makePng(), filename: "photo.jpg", actor: "human" })),
    ).toBe("type_mismatch");
    expect(
      await code(
        inspectUpload({
          bytes: makePng(),
          declaredType: "image/png",
          filename: "x.png",
          actor: "human",
        }).then(() => {
          throw new InvariantError("retry", "ok");
        }),
      ),
    ).toBe("retry");
  });

  it("refuses a 60-megapixel PNG and files over the cap", async () => {
    expect(
      await code(
        inspectUpload({ bytes: makePng({ width: 10_000, height: 6_000 }), actor: "human" }),
      ),
    ).toBe("too_many_pixels");
    expect(
      await code(inspectUpload({ bytes: makePng({ width: 12_001, height: 10 }), actor: "human" })),
    ).toBe("too_many_pixels");
    expect(await code(inspectUpload({ bytes: makePng(), actor: "agent", maxBytes: 10 }))).toBe(
      "too_large",
    );
  });

  it("SVG: people only, and validated", async () => {
    const svg = text(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><script>alert(1)</script></svg>',
    );
    expect(await code(inspectUpload({ bytes: svg, actor: "agent" }))).toBe("unsupported_type");
    const e = await inspectUpload({ bytes: svg, actor: "human" }).catch((x) => x);
    expect(e.code).toBe("svg_unsafe");
    expect(e.message).toMatch(/script elements \(1\)/);
    const clean = await inspectUpload({
      bytes: text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 20"/>'),
      actor: "human",
    });
    expect(clean).toMatchObject({ mediaType: "image/svg+xml", image: { width: 10, height: 20 } });
  });

  it("data: the declared type picks the text format; HTML and binaries are refused", async () => {
    const csv = await inspectUpload({
      bytes: text("a,b\n1,2\n"),
      filename: "hourly.csv",
      actor: "agent",
    });
    expect(csv).toMatchObject({ mediaType: "text/csv", kind: "data", ext: "csv" });
    const json = await inspectUpload({
      bytes: text('[{"a":1}]'),
      declaredType: "application/json",
      actor: "agent",
    });
    expect(json.mediaType).toBe("application/json");
    expect(
      await code(
        inspectUpload({ bytes: text("a,b"), declaredType: "application/json", actor: "agent" }),
      ),
    ).toBe("type_mismatch");
    expect(await code(inspectUpload({ bytes: text("a,b"), actor: "agent" }))).toBe(
      "unsupported_type",
    );
    expect(
      await code(
        inspectUpload({
          bytes: text("<html><script>1</script>"),
          declaredType: "text/csv",
          actor: "agent",
        }),
      ),
    ).toBe("unsupported_type");
    expect(await code(inspectUpload({ bytes: text("PK\u0003\u0004zip"), actor: "human" }))).toBe(
      "unsupported_type",
    );
    expect(await code(inspectUpload({ bytes: new Uint8Array(0), actor: "human" }))).toBe(
      "unsupported_type",
    );
    const pdf = await inspectUpload({
      bytes: text("%PDF-1.7\n1 0 obj"),
      declaredType: "application/pdf",
      actor: "agent",
    });
    expect(pdf).toMatchObject({ kind: "document", ext: "pdf" });
    expect(pdf.image).toBeUndefined();
  });
});

describe("references and URLs", () => {
  it("finds asset: links and images in markdown, not in code", () => {
    const md = [
      "![](asset:asset_01HZX8K3Q9PH)",
      '![Ferries](asset:asset_01HZX8K3Q9PH "Kadıköy")',
      "[CSV](asset:asset_01HZX8K3Q9DS) and [bad](asset:asset_01HZX8K3Q9DS/x) [also](ASSET:asset_01HZX8K3Q9ZZ)",
      "`[x](asset:asset_inlinecode1)`",
      "```\n![](asset:asset_codeblock01)\n```",
      "- item ![](asset:asset_inlistitem1)",
      "| a |\n|---|\n| [t](asset:asset_intablecel1) |",
    ].join("\n\n");
    expect(markdownAssetIds(md).sort()).toEqual([
      "asset_01HZX8K3Q9DS",
      "asset_01HZX8K3Q9PH",
      "asset_inlistitem1",
      "asset_intablecel1",
    ]);
  });

  it("collects ImageRef and markdown references per slot; canonicalises src and size", () => {
    const entry = {
      body: { format: "markdown", value: "![](asset:asset_01HZX8K3Q9PH)" },
      coverImage: { assetId: "asset_01HZX8K3Q9PH", src: "x", alt: "" },
    };
    expect(assetRefsOf("contentEntry", entry)).toEqual([
      { assetId: "asset_01HZX8K3Q9PH", field: "body" },
      { assetId: "asset_01HZX8K3Q9PH", field: "coverImage" },
    ]);
    const asset = {
      sha256: "a".repeat(64),
      slug: "bosphorus-at-dawn",
      mediaType: "image/jpeg",
      storage: { kind: "blob" },
      image: { width: 3000, height: 2000 },
    };
    const copy = structuredClone(entry) as never;
    canonicalImageRefs("contentEntry", copy, new Map([["asset_01HZX8K3Q9PH", asset as never]]));
    expect((copy as { coverImage: unknown }).coverImage).toEqual({
      assetId: "asset_01HZX8K3Q9PH",
      src: "/media/aaaaaaaaaaaaaaaa/bosphorus-at-dawn.jpg",
      alt: "",
      width: 3000,
      height: 2000,
    });
  });

  it("media paths, the route pattern, reserved paths and slugs", () => {
    const p = mediaPath({
      sha256: "0123456789abcdef".repeat(4),
      slug: "kadikoy",
      mediaType: "text/csv",
    });
    expect(p).toBe("/media/0123456789abcdef/kadikoy.csv");
    expect(MEDIA_ROUTE.exec(p)?.slice(1)).toEqual([
      "0123456789abcdef",
      "kadikoy",
      "csv",
      undefined,
    ]);
    expect(MEDIA_ROUTE.exec(`${p}.sha256`)?.[4]).toBe(".sha256");
    expect(MEDIA_ROUTE.test("/media/0123456789abcdeg/x.jpg")).toBe(false);
    expect(MEDIA_ROUTE.test("/media/about")).toBe(false);
    expect(isReservedMediaPath("/media/0123456789abcdef/x")).toBe(true);
    expect(isReservedMediaPath("/media/0123456789abcdef")).toBe(false);
    expect(isReservedMediaPath("/media/0123456789abcdef/")).toBe(true);
    expect(isReservedMediaPath("/media")).toBe(false);
    expect(isReservedMediaPath("/media/press-kit")).toBe(false);
    expect(slugifyFilename("Boğaz at Dawn (1).JPG")).toBe("bogaz-at-dawn-1");
    expect(slugifyFilename("İstanbul ışıkları.png")).toBe("istanbul-isiklari");
    expect(slugifyFilename("...")).toBe("file");
  });
});
