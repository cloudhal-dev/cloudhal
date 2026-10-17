/**
 * `cloudhal media placeholders [--remote] [--all] [--dry-run]` (RFC-0028 §5): gives images their
 * placeholder — a 24 px LQIP and the dominant colour — where nothing drew one: files that agents,
 * imports or `cloudhal push` brought in (Studio draws them on upload). Workers cannot decode
 * images and the deployment has no Images binding, so the drawing happens here, in the local
 * Chrome (the one `render_page` uses), with the code Studio runs.
 *
 * Without `--remote` it works on the project's SQLite; with it, on the deployment through the
 * admin API (deployment token). `--all` redraws images that already have a colour.
 * Transparent images get their colour only: the renderer never paints their LQIP.
 */
import path from "node:path";
import type { Asset } from "@cloudhal/core-contracts";
import { openLocalStore } from "@cloudhal/core-ts/local";
import {
  candidateOf,
  dominantColor,
  leanWebp,
  needsPlaceholder,
  type PlaceholderCandidate,
} from "@cloudhal/core-ts/media";
import { bytesToBase64, type PageRenderer } from "@cloudhal/mcp-server/render";
import { readProjectConfig } from "../config.ts";
import { chromeRenderer, findChrome } from "../render-chrome.ts";
import { brief, deployment, type SyncOptions } from "./sync.ts";

export interface PlaceholdersCliOptions extends SyncOptions {
  readonly remote?: boolean;
  /** Redraw images that already have a colour. */
  readonly all?: boolean;
  readonly dryRun?: boolean;
  /** Tests inject a renderer; default: the local Chrome. */
  readonly renderer?: PageRenderer;
}

export interface Placeholder {
  readonly lqip?: string;
  readonly color?: string;
}

export interface PlaceholdersReport {
  readonly where: "local" | "remote";
  readonly candidates: number;
  readonly drawn: number;
  readonly failed: { readonly id: string; readonly reason: string }[];
  readonly dryRun: boolean;
}

/** Larger files are skipped: the placeholder is not worth moving tens of megabytes. */
const MAX_BYTES = 25 * 1024 * 1024;

/**
 * Draws one image in the page at ≤ 24 px: the canvas's WebP and its pixels (for the colour).
 * An `<img>` rather than `createImageBitmap`, so SVG draws too (at the asset's own size).
 */
const DRAW = (b64: string, mediaType: string, width: number, height: number) => `(async () => {
  const bytes = Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: ${JSON.stringify(mediaType)} }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || ${width};
    const h = img.naturalHeight || ${height};
    const scale = 24 / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return {
      webp: canvas.toDataURL("image/webp", 0.5),
      rgba: Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
})()`;

/** Where candidates come from and where placeholders go. */
interface Target {
  readonly where: "local" | "remote";
  list(all: boolean): Promise<PlaceholderCandidate[]>;
  bytes(c: PlaceholderCandidate): Promise<Uint8Array>;
  save(c: PlaceholderCandidate, p: Placeholder): Promise<void>;
  close(): Promise<void>;
}

export async function mediaPlaceholders(
  options: PlaceholdersCliOptions,
): Promise<PlaceholdersReport> {
  const target = options.remote ? await remoteTarget(options) : await localTarget(options);
  try {
    const candidates = await target.list(options.all === true);
    const failed: { id: string; reason: string }[] = [];
    if (options.dryRun || candidates.length === 0)
      return {
        where: target.where,
        candidates: candidates.length,
        drawn: 0,
        failed,
        dryRun: !!options.dryRun,
      };
    const renderer = options.renderer ?? defaultRenderer();
    const session = await renderer.session();
    let drawn = 0;
    try {
      const tab = await session.open("about:blank", { width: 64, height: 64 });
      for (const c of candidates) {
        try {
          const bytes = await target.bytes(c);
          if (bytes.byteLength > MAX_BYTES) throw new Error("larger than 25 MB; skipped");
          const out = await tab.evaluate<{ webp: string; rgba: number[] }>(
            DRAW(bytesToBase64(bytes), c.mediaType, c.width, c.height),
          );
          const lqip = leanWebp(out.webp);
          const color = dominantColor(out.rgba);
          const placeholder: Placeholder = {
            ...(!c.alpha && /^data:image\/webp;base64,/.test(lqip) && lqip.length <= 3000
              ? { lqip }
              : {}),
            ...(color ? { color } : {}),
          };
          if (!placeholder.color && !placeholder.lqip) throw new Error("nothing visible to draw");
          await target.save(c, placeholder);
          drawn++;
        } catch (e) {
          failed.push({ id: c.id, reason: e instanceof Error ? e.message : String(e) });
        }
      }
      await tab.close();
    } finally {
      await session.close();
    }
    return { where: target.where, candidates: candidates.length, drawn, failed, dryRun: false };
  } finally {
    await target.close();
  }
}

function defaultRenderer(): PageRenderer {
  const chrome = findChrome();
  if (!chrome)
    throw new Error(
      "placeholders are drawn in a local Chrome and none was found; install Chrome or set CHROME_PATH",
    );
  return chromeRenderer(chrome, { idleMs: 1000 });
}

async function localTarget(options: PlaceholdersCliOptions): Promise<Target> {
  const cfg = await readProjectConfig(options.projectDir);
  const local = await openLocalStore(path.join(options.projectDir, cfg.dataDir));
  const { store } = local;
  return {
    where: "local",
    async list(all) {
      const out: PlaceholderCandidate[] = [];
      let cursor: string | undefined;
      do {
        const page = await store.listAssets(cfg.siteId, {
          kind: ["image"],
          status: ["active", "retired"],
          ...(cursor ? { cursor } : {}),
        });
        for (const a of page.assets) if (needsPlaceholder(a, all)) out.push(candidateOf(a));
        cursor = page.nextCursor;
      } while (cursor);
      return out;
    },
    async bytes(c) {
      const bytes = await store.readMediaBlob(cfg.siteId, c.sha256);
      if (!bytes) throw new Error("its bytes are missing");
      return bytes;
    },
    async save(c, p) {
      const asset = await store.getAsset(c.id);
      if (!asset?.image) throw new Error("it is gone");
      await store.updateAsset({ ...asset, image: withPlaceholder(asset.image, p) });
    },
    close: () => local.close(),
  };
}

async function remoteTarget(options: PlaceholdersCliOptions): Promise<Target> {
  const { cfg, adminUrl, token, fetch: f } = await deployment(options);
  const auth = { authorization: `Bearer ${token}` };
  const call = async (url: string, init: RequestInit = {}) => {
    const res = await f(new URL(url, adminUrl), { ...init, headers: { ...auth, ...init.headers } });
    if (
      res.status === 404 &&
      url.includes("placeholders") &&
      !(await res.clone().text()).includes("not found:")
    )
      throw new Error(
        "the deployment has no placeholder backfill yet (deploy this version with `cloudhal deploy` first)",
      );
    if (!res.ok)
      throw new Error(`the deployment answered ${res.status}: ${brief(await res.text())}`);
    return res;
  };
  const base = `/api/admin/sites/${cfg.siteId}`;
  return {
    where: "remote",
    async list(all) {
      const res = await call(`${base}/media-placeholders${all ? "?all=1" : ""}`);
      return ((await res.json()) as { assets: PlaceholderCandidate[] }).assets;
    },
    async bytes(c) {
      const res = await call(`${base}/media/${c.sha256}`);
      return new Uint8Array(await res.arrayBuffer());
    },
    async save(c, p) {
      await call(`${base}/media-placeholders/${c.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rev: c.rev, ...p }),
      });
    },
    close: async () => {},
  };
}

/** An image's fields with new placeholders: what the server measured and the focal point stay. */
export function withPlaceholder(
  image: NonNullable<Asset["image"]>,
  p: Placeholder,
): NonNullable<Asset["image"]> {
  const { lqip: _l, color: _c, ...kept } = image;
  return { ...kept, ...(p.lqip ? { lqip: p.lqip } : {}), ...(p.color ? { color: p.color } : {}) };
}

export function describePlaceholders(r: PlaceholdersReport): string {
  if (r.candidates === 0) return `${r.where}: every image has its placeholder`;
  if (r.dryRun)
    return `${r.where}: ${r.candidates} image(s) need a placeholder (dry run, nothing drawn)`;
  const lines = [`${r.where}: drew ${r.drawn} of ${r.candidates} placeholder(s)`];
  for (const f of r.failed) lines.push(`  ${f.id}: ${f.reason}`);
  return lines.join("\n");
}
