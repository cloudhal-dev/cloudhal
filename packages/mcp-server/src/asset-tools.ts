/**
 * Media tools (RFC-0004 §6.2): agents list and read the library, add files with `upload_asset`
 * (base64, ≤ 4 MB) or `fetch_asset_url` (server-side fetch under the SSRF rules, ≤ 25 MB), edit
 * their metadata, and — with `asset:manage` — retire, restore or delete them. Uploads are never
 * public by themselves: publishing decides (§6.3). Agents cannot upload SVG, keep metadata or
 * register external files in v1 (answers 2, 3, 8). Each change takes one snapshot.
 */
import { holds } from "@cloudhal/agent-runtime";
import type { Asset, Site } from "@cloudhal/core-contracts";
import { AssetSchema, SnapshotSchema } from "@cloudhal/core-contracts";
import { termName } from "@cloudhal/core-ts";
import {
  formatBytes,
  MEDIA_LIMITS,
  MEDIA_TYPES,
  mediaPath,
  safeFetch,
  sniff,
  workersTransport,
} from "@cloudhal/core-ts/media";
import {
  ACTOR_OWNERSHIP,
  autoSnapshot,
  callerPerson,
  id,
  type JsonSchema,
  mapError,
  obj,
  quote,
  requireSite,
  SLUG_PATTERN,
  str,
  strip,
  type ToolContext,
  type ToolDefinition,
  ToolError,
} from "./common.ts";

const ASSET = strip(AssetSchema);
const SNAPSHOT = strip(SnapshotSchema);
const ASSET_DEFS = (ASSET.$defs ?? {}) as Record<string, JsonSchema>;

const READ = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;
const WRITE = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const MB = 1024 * 1024;
const DAY_MS = 24 * 60 * 60 * 1000;

/** What agents may fetch: every accepted type except SVG (people only in v1). */
const FETCH_TYPES = Object.entries(MEDIA_TYPES)
  .filter(([, info]) => !info.peopleOnly)
  .map(([type]) => type);

const TEXT_FIELDS = {
  alt: str(
    "Alternative text in `locale` (default: the site's default locale). Images need it, or decorative: true.",
    { minLength: 1, maxLength: 500 },
  ),
  decorative: {
    type: "boolean",
    description: 'The image carries no information and renders with alt="".',
  },
  title: str("Display title in `locale`", { minLength: 1, maxLength: 300 }),
  caption: str("Default caption in `locale` (plain text)", { minLength: 1, maxLength: 1000 }),
  credit: str("Who made it, e.g. 'Photo: Ayşe Yılmaz'", { minLength: 1, maxLength: 300 }),
  license: { ...(ASSET_DEFS.AssetLicense as JsonSchema), $defs: ASSET_DEFS },
  locale: str("BCP 47 locale of alt, title and caption; defaults to the site's default locale"),
};

const ASSET_OUT = obj(
  {
    asset: ASSET,
    existing: { type: "boolean", description: "The site already had these bytes" },
    url: { type: "string", description: "Site-relative URL (live once published)" },
    usage: { type: "integer" },
    snapshot: SNAPSHOT,
  },
  ["asset", "existing", "url", "usage"],
);

function url(asset: Asset): string {
  return asset.storage.kind === "external" ? asset.storage.url : mediaPath(asset);
}

function texts(
  site: Site,
  a: Record<string, unknown>,
): Pick<Asset, "alt" | "title" | "caption"> & { credit?: string; decorative?: true } {
  const locale = (a.locale as string | undefined) ?? site.defaultLocale;
  const map = (v: unknown) => (typeof v === "string" && v.trim() ? { [locale]: v } : undefined);
  const alt = map(a.alt);
  const title = map(a.title);
  const caption = map(a.caption);
  return {
    ...(alt ? { alt } : {}),
    ...(title ? { title } : {}),
    ...(caption ? { caption } : {}),
    ...(typeof a.credit === "string" && a.credit.trim() ? { credit: a.credit } : {}),
    ...(a.decorative === true ? { decorative: true as const } : {}),
  };
}

/** "image "Bosphorus at dawn" (JPEG, 3000×2000, 482 KB)" — quoted and shortened (§6.2). */
export function describeAsset(asset: Asset, locale: string | undefined): string {
  const name =
    (locale ? (asset.title?.[locale] ?? asset.alt?.[locale]) : undefined) ??
    Object.values(asset.title ?? {})[0] ??
    asset.slug;
  const type = MEDIA_TYPES[asset.mediaType]?.label ?? asset.mediaType;
  const size = asset.image ? `${asset.image.width}×${asset.image.height}, ` : "";
  const kind = asset.kind === "other" || asset.kind === "data" ? "file" : asset.kind;
  return `${kind} "${quote(name)}" (${type}, ${size}${formatBytes(asset.bytes)})`;
}

/** Images need alt text in the site's default locale or `decorative: true` (§5.6). */
function requireAlt(head: Uint8Array, a: Record<string, unknown>): void {
  const s = sniff(head);
  const image = s.kind === "type" && s.mediaType.startsWith("image/");
  if (image && !(typeof a.alt === "string" && a.alt.trim()) && a.decorative !== true)
    throw new ToolError(
      "invalid",
      "images need alt text (what the image shows, for screen readers) or decorative: true",
    );
}

/** Agent limits per key per day (§5.6), checked before anything is fetched or stored. */
async function dailyLimit(ctx: ToolContext, addBytes: number): Promise<void> {
  if (ctx.principal.actor.kind !== "agent") return;
  const maxAssets = ctx.media?.agentDailyAssets ?? 100;
  const maxBytes = ctx.media?.agentDailyBytes ?? 500 * MB;
  const since = new Date((ctx.now?.() ?? new Date()).getTime() - DAY_MS).toISOString();
  const used = await ctx.store.assetUploadStats(ctx.principal.actor.id, since);
  if (used.count >= maxAssets || used.bytes + addBytes > maxBytes)
    throw new ToolError(
      "denied",
      `this agent key added ${used.count} files (${formatBytes(used.bytes)}) in the last 24 hours; the limit is ${maxAssets} files and ${formatBytes(maxBytes)}`,
    );
}

/** A file name without path separators or control characters (kept for search only). */
function cleanName(name: string | undefined): string | undefined {
  const clean = [...(name ?? "")]
    .filter((c) => c.charCodeAt(0) >= 0x20 && c.charCodeAt(0) !== 0x7f && c !== "/" && c !== "\\")
    .join("")
    .slice(0, 255);
  return clean || undefined;
}

function decodeBase64(data: string): Uint8Array {
  const clean = data.replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 === 1)
    throw new ToolError("invalid", "data must be base64");
  const bin = atob(clean);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function requireAsset(ctx: ToolContext, siteId: string, assetId: string): Promise<Asset> {
  const asset = await ctx.store.getAsset(assetId);
  if (!asset || asset.siteId !== siteId)
    throw new ToolError("not_found", `asset ${assetId} not found`);
  return asset;
}

/** Where an asset is used, with the referring node's title (for agents and approval prompts). */
async function usesOf(ctx: ToolContext, asset: Asset, locale: string) {
  const usage = (await ctx.store.assetUsage(asset.siteId, [asset.id])).get(asset.id);
  const out: { nodeId: string; nodeKind: string; field: string; title?: string }[] = [];
  for (const ref of usage?.refs ?? []) {
    let title: string | undefined;
    if (ref.nodeKind === "contentEntry")
      title = (await ctx.store.getContentEntry(ref.nodeId))?.title;
    else if (ref.nodeKind === "page") title = (await ctx.store.getPage(ref.nodeId))?.title;
    else if (ref.nodeKind === "term") {
      const t = await ctx.store.getTerm(ref.nodeId);
      title = t ? termName(t, locale) : undefined;
    }
    out.push({ ...ref, ...(title ? { title } : {}) });
  }
  return out;
}

function report(ctx: ToolContext, asset: Asset, extra: Record<string, unknown> = {}): void {
  ctx.report?.({
    asset: {
      id: asset.id,
      sha256: asset.sha256,
      bytes: asset.bytes,
      mediaType: asset.mediaType,
      source: asset.source,
      ...extra,
    },
  });
}

/**
 * `asset:upload` edits one's own uploads; `asset:manage` edits any (RFC-0005 table). "Own" is
 * measured against the person behind the caller (RFC-0005 §4): a Contributor's agent may edit
 * what the Contributor or the agent uploaded.
 */
async function ownOrManage(a: Record<string, unknown>, ctx: ToolContext): Promise<void> {
  if (holds(ctx.principal.scopes, "asset:manage")) return;
  const asset = await requireAsset(ctx, a.siteId as string, a.assetId as string);
  const owner = await (ctx.ownership ?? ACTOR_OWNERSHIP).personOf(asset.uploadedBy);
  const mine = asset.uploadedBy.id === ctx.principal.actor.id || owner === callerPerson(ctx);
  if (!mine)
    throw new ToolError(
      "denied",
      `asset:upload lets an agent edit its own uploads; ${asset.id} was added by ${asset.uploadedBy.name ?? asset.uploadedBy.id} (asset:manage edits any file)`,
    );
}

export function assetTools(): ToolDefinition[] {
  const siteAsset = obj({ siteId: id, assetId: id }, ["siteId", "assetId"]);
  const revInput = obj({ siteId: id, assetId: id, rev: { type: "integer", minimum: 0 } }, [
    "siteId",
    "assetId",
    "rev",
  ]);
  const statusTool = (
    name: "retire_asset" | "restore_asset",
    title: string,
    description: string,
  ): ToolDefinition => ({
    name,
    title,
    description,
    inputSchema: revInput,
    outputSchema: obj({ asset: ASSET, snapshot: SNAPSHOT }, ["asset", "snapshot"]),
    annotations: { ...WRITE, idempotentHint: true },
    scopes: ["asset:manage"],
    handler: async (a, ctx) => {
      const asset = await requireAsset(ctx, a.siteId as string, a.assetId as string);
      try {
        const next = { ...asset, rev: a.rev as number };
        const saved =
          name === "retire_asset"
            ? await ctx.store.retireAsset(next)
            : await ctx.store.restoreAsset(next);
        report(ctx, saved, { status: saved.status });
        return { asset: saved, snapshot: await autoSnapshot(ctx, asset.siteId, name) };
      } catch (e) {
        mapError(e);
      }
    },
  });

  return [
    {
      name: "list_assets",
      title: "List media",
      description:
        "Files of a site's media library, newest first: images, video, audio, documents and data. Each item has its site URL, size, SHA-256, alt text per locale, status and how many places use it. Filter by kind, status, words in title/alt/caption/file name, unused files or images missing alt text.",
      inputSchema: obj(
        {
          siteId: id,
          kind: {
            type: "array",
            items: {
              type: "string",
              enum: ["image", "video", "audio", "document", "data", "other"],
            },
            minItems: 1,
            uniqueItems: true,
          },
          status: {
            type: "array",
            items: { type: "string", enum: ["active", "retired"] },
            minItems: 1,
            uniqueItems: true,
          },
          query: str("Words to look for", { minLength: 1, maxLength: 200 }),
          unused: { type: "boolean" },
          missingAlt: { type: "boolean" },
          uploadedBy: { type: "string", enum: ["human", "agent"] },
          cursor: str("From the previous page's nextCursor", { maxLength: 200 }),
          limit: { type: "integer", minimum: 1, maximum: 200 },
        },
        ["siteId"],
      ),
      outputSchema: obj(
        {
          assets: {
            type: "array",
            items: obj({ asset: ASSET, url: { type: "string" }, usage: { type: "integer" } }, [
              "asset",
              "url",
              "usage",
            ]),
          },
          nextCursor: { type: "string" },
        },
        ["assets"],
      ),
      annotations: READ,
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        await requireSite(ctx, a.siteId as string);
        try {
          const page = await ctx.store.listAssets(a.siteId as string, {
            ...(a.kind ? { kind: a.kind as Asset["kind"][] } : {}),
            ...(a.status ? { status: a.status as Asset["status"][] } : {}),
            ...(a.query ? { query: a.query as string } : {}),
            ...(a.unused ? { unused: true } : {}),
            ...(a.missingAlt ? { missingAlt: true } : {}),
            ...(a.uploadedBy ? { uploadedBy: a.uploadedBy as "human" | "agent" } : {}),
            ...(a.cursor ? { cursor: a.cursor as string } : {}),
            ...(a.limit ? { limit: a.limit as number } : {}),
          });
          const usage = await ctx.store.assetUsage(
            a.siteId as string,
            page.assets.map((x) => x.id),
          );
          return {
            assets: page.assets.map((asset) => ({
              asset,
              url: url(asset),
              usage: usage.get(asset.id)?.total ?? 0,
            })),
            ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
          };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "get_asset",
      title: "Get media file",
      description:
        "One file of the media library with its URL, checksum file and every place that uses it (node, field and title).",
      inputSchema: siteAsset,
      outputSchema: obj(
        {
          asset: ASSET,
          url: { type: "string" },
          checksumUrl: { type: "string" },
          uses: { type: "array", items: { type: "object" } },
        },
        ["asset", "url", "uses"],
      ),
      annotations: READ,
      scopes: ["content:read"],
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const asset = await requireAsset(ctx, site.id, a.assetId as string);
        return {
          asset,
          url: url(asset),
          ...(asset.storage.kind === "blob" ? { checksumUrl: `${mediaPath(asset)}.sha256` } : {}),
          uses: await usesOf(ctx, asset, site.defaultLocale),
        };
      },
    },
    {
      name: "upload_asset",
      title: "Upload media",
      description: `Add a file to the site's media library from base64 data (at most ${MEDIA_LIMITS.uploadAsset / MB} MB decoded). The server checks the type from the bytes (JPEG, PNG, WebP, AVIF, GIF, MP4, WebM, MP3, M4A, Ogg, WAV, PDF, CSV, TSV, JSON, NDJSON, Parquet; no SVG), strips photo metadata such as GPS, and returns the asset. Images need alt text or decorative: true. Uploading the same bytes again returns the existing asset (existing: true). Use it in an article with coverImage: {assetId} or in markdown as ![alt](asset:<id>). Nothing is public until the site is published.`,
      inputSchema: obj(
        {
          siteId: id,
          filename: str(
            "Original file name, e.g. ferries.jpg (its extension must match the content)",
            {
              minLength: 1,
              maxLength: 255,
              pattern: "^[^/\\\\\\u0000-\\u001f\\u007f]+$",
            },
          ),
          data: str("The file's bytes, base64", {
            minLength: 4,
            maxLength: Math.ceil((MEDIA_LIMITS.uploadAsset * 4) / 3) + 8,
          }),
          mediaType: str(
            "What you believe the type is, e.g. image/png (checked against the bytes)",
            {
              maxLength: 255,
            },
          ),
          slug: str("File name in the URL, without extension", {
            pattern: SLUG_PATTERN,
            maxLength: 96,
          }),
          ...TEXT_FIELDS,
        },
        ["siteId", "filename", "data"],
      ),
      outputSchema: ASSET_OUT,
      annotations: WRITE,
      scopes: ["asset:upload"],
      auditArgs: ({ data, ...rest }) => ({
        ...rest,
        data: { base64Chars: typeof data === "string" ? data.length : 0 },
      }),
      approvalPrompt: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        const size = Math.floor(((a.data as string | undefined)?.length ?? 0) * 0.75);
        const name = (a.alt ?? a.title ?? a.filename) as string;
        return `Add media "${quote(name)}" (${quote(a.filename as string, 80)}, about ${formatBytes(size)}) to "${quote(site?.name ?? (a.siteId as string))}"? It becomes public only when the site is published.`;
      },
      precheck: async (a, ctx) => {
        const bytes = decodeBase64(a.data as string);
        if (bytes.byteLength > MEDIA_LIMITS.uploadAsset)
          throw new ToolError(
            "too_large",
            `upload_asset takes at most ${MEDIA_LIMITS.uploadAsset / MB} MB; use fetch_asset_url for larger public files, or ask a person to upload it in Studio`,
          );
        requireAlt(bytes.subarray(0, 4096), a);
        await dailyLimit(ctx, bytes.byteLength);
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const bytes = decodeBase64(a.data as string);
        try {
          const r = await ctx.store.ingestAsset({
            siteId: site.id,
            bytes,
            declaredType: a.mediaType as string | undefined,
            filename: a.filename as string,
            uploadedBy: ctx.principal.actor,
            source: { kind: "upload" },
            maxBytes: MEDIA_LIMITS.uploadAsset,
            fields: {
              ...texts(site, a),
              ...(a.license ? { license: a.license as Asset["license"] } : {}),
              ...(a.slug ? { slug: a.slug as string } : {}),
            },
          });
          report(ctx, r.asset, { existing: r.existing });
          const usage =
            (await ctx.store.assetUsage(site.id, [r.asset.id])).get(r.asset.id)?.total ?? 0;
          return {
            asset: r.asset,
            existing: r.existing,
            url: url(r.asset),
            usage,
            ...(r.existing ? {} : { snapshot: await autoSnapshot(ctx, site.id, "upload_asset") }),
          };
        } catch (e) {
          mapError(e);
        }
      },
    },
    {
      name: "fetch_asset_url",
      title: "Add media from a URL",
      description: `Have the server download a public https file (at most ${MEDIA_LIMITS.fetchAsset / MB} MB) into the site's media library: the server fetches it under strict rules (https only, no internal hosts or IP addresses, at most 3 redirects, the site's host list when it has one), checks the type from the bytes, strips photo metadata and stores its own copy, so the page never depends on the other site. Images need alt text or decorative: true. Pass the address of the file itself, not of a web page.`,
      inputSchema: obj(
        {
          siteId: id,
          url: str("https address of the file", {
            minLength: 9,
            maxLength: 2048,
            pattern: "^https://",
          }),
          filename: str("File name to keep for search (default: from the URL)", {
            minLength: 1,
            maxLength: 255,
            pattern: "^[^/\\\\\\u0000-\\u001f\\u007f]+$",
          }),
          slug: str("File name in the URL, without extension", {
            pattern: SLUG_PATTERN,
            maxLength: 96,
          }),
          ...TEXT_FIELDS,
        },
        ["siteId", "url"],
      ),
      outputSchema: ASSET_OUT,
      annotations: { ...WRITE, openWorldHint: true },
      scopes: ["asset:upload"],
      approvalPrompt: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        return `Download ${quote(a.url as string, 120)} into the media library of "${quote(site?.name ?? (a.siteId as string))}"? It becomes public only when the site is published.`;
      },
      precheck: async (_a, ctx) => {
        await dailyLimit(ctx, 0);
      },
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const siteHosts = (site.metadata?.["cloudhal.media.allowHosts"] ?? "")
          .split(/[\s,]+/)
          .filter(Boolean);
        const allowHosts = [...(ctx.media?.allowHosts ?? []), ...siteHosts];
        const fetchedAt = (ctx.now?.() ?? new Date()).toISOString();
        try {
          const res = await safeFetch(a.url as string, {
            transport: ctx.media?.fetchTransport ?? workersTransport(),
            maxBytes: MEDIA_LIMITS.fetchAsset,
            accept: FETCH_TYPES,
            ...(allowHosts.length ? { allowHosts } : {}),
            blockedHosts: [
              ...(ctx.media?.blockedHosts ?? []),
              ...site.domains.map((d) => d.hostname),
            ],
          });
          requireAlt(res.bytes.subarray(0, 4096), a);
          await dailyLimit(ctx, res.bytes.byteLength);
          const fromUrl = decodeURIComponent(new URL(res.url).pathname.split("/").pop() ?? "");
          const filename = (a.filename as string | undefined) ?? (fromUrl || undefined);
          const r = await ctx.store.ingestAsset({
            siteId: site.id,
            bytes: res.bytes,
            declaredType: res.contentType,
            filename: cleanName(filename),
            uploadedBy: ctx.principal.actor,
            source: { kind: "fetch", url: a.url as string, fetchedAt },
            maxBytes: MEDIA_LIMITS.fetchAsset,
            fields: {
              ...texts(site, a),
              ...(a.license ? { license: a.license as Asset["license"] } : {}),
              ...(a.slug ? { slug: a.slug as string } : {}),
            },
          });
          report(ctx, r.asset, {
            existing: r.existing,
            fetch: {
              requested: a.url,
              final: res.url,
              redirects: res.chain.length - 1,
              ...(res.address ? { address: res.address } : {}),
            },
          });
          const usage =
            (await ctx.store.assetUsage(site.id, [r.asset.id])).get(r.asset.id)?.total ?? 0;
          return {
            asset: r.asset,
            existing: r.existing,
            url: url(r.asset),
            usage,
            ...(r.existing
              ? {}
              : { snapshot: await autoSnapshot(ctx, site.id, "fetch_asset_url") }),
          };
        } catch (e) {
          if (e instanceof ToolError) throw e;
          mapError(e);
        }
      },
    },
    {
      name: "update_asset",
      title: "Update media details",
      description:
        "Change a file's alt text, title or caption (in `locale`), credit, license, decorative flag or URL slug. Requires the current `rev`. An old URL keeps working after a slug change (it redirects). Agents with asset:upload edit their own uploads; asset:manage edits any file.",
      inputSchema: obj(
        {
          siteId: id,
          assetId: id,
          rev: { type: "integer", minimum: 0 },
          slug: str("New file name in the URL", { pattern: SLUG_PATTERN, maxLength: 128 }),
          ...TEXT_FIELDS,
        },
        ["siteId", "assetId", "rev"],
      ),
      outputSchema: obj({ asset: ASSET, snapshot: SNAPSHOT }, ["asset", "snapshot"]),
      annotations: WRITE,
      scopes: ["asset:upload"],
      precheck: ownOrManage,
      handler: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const asset = await requireAsset(ctx, site.id, a.assetId as string);
        if (asset.rev !== a.rev)
          throw new ToolError(
            "conflict",
            `asset ${asset.id} is at rev ${asset.rev}, you sent ${a.rev}; reload and retry`,
          );
        const locale = (a.locale as string | undefined) ?? site.defaultLocale;
        const set = (map: Asset["alt"], value: unknown) =>
          value === undefined ? map : { ...(map ?? {}), [locale]: value as string };
        const next: Asset = {
          ...asset,
          ...(a.slug ? { slug: a.slug as string } : {}),
          ...(a.alt !== undefined ? { alt: set(asset.alt, a.alt) } : {}),
          ...(a.title !== undefined ? { title: set(asset.title, a.title) } : {}),
          ...(a.caption !== undefined ? { caption: set(asset.caption, a.caption) } : {}),
          ...(a.credit !== undefined ? { credit: a.credit as string } : {}),
          ...(a.license !== undefined ? { license: a.license as Asset["license"] } : {}),
          ...(a.decorative !== undefined ? { decorative: a.decorative as boolean } : {}),
        } as Asset;
        try {
          const saved = await ctx.store.updateAsset(next);
          report(ctx, saved);
          return { asset: saved, snapshot: await autoSnapshot(ctx, site.id, "update_asset") };
        } catch (e) {
          mapError(e);
        }
      },
    },
    statusTool(
      "retire_asset",
      "Retire media",
      "Hide a file from the library and pickers so nothing new uses it. Pages and articles that already show it keep showing it. Requires the current `rev`.",
    ),
    statusTool(
      "restore_asset",
      "Restore media",
      "Make a retired file available again. Requires the current `rev`.",
    ),
    {
      name: "delete_asset",
      title: "Delete media",
      description:
        "Delete a file from the media library. Refused while anything uses it (the error lists the uses). Its bytes stay as long as a snapshot needs them, so rollback keeps working. Destructive: requires approval.",
      inputSchema: revInput,
      outputSchema: obj({ snapshot: SNAPSHOT }, ["snapshot"]),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
      scopes: ["asset:manage"],
      // A delete that cannot succeed never waits for a person: refuse while in use, with the uses.
      precheck: async (a, ctx) => {
        const site = await requireSite(ctx, a.siteId as string);
        const asset = await requireAsset(ctx, site.id, a.assetId as string);
        const uses = await usesOf(ctx, asset, site.defaultLocale);
        if (uses.length > 0)
          throw new ToolError(
            "in_use",
            `${describeAsset(asset, site.defaultLocale)} is used by ${uses
              .slice(0, 5)
              .map((u) => (u.title ? `"${quote(u.title)}"` : u.nodeId))
              .join(
                ", ",
              )}${uses.length > 5 ? ` and ${uses.length - 5} more` : ""}; remove those uses first, or retire it instead`,
            { uses },
          );
      },
      approvalPrompt: async (a, ctx) => {
        const site = await ctx.store.getSite(a.siteId as string);
        const asset = await ctx.store.getAsset(a.assetId as string);
        return asset
          ? `Delete ${describeAsset(asset, site?.defaultLocale)} from the media library? Earlier snapshots keep its bytes until they are no longer needed.`
          : `Delete asset ${a.assetId}?`;
      },
      handler: async (a, ctx) => {
        const asset = await requireAsset(ctx, a.siteId as string, a.assetId as string);
        try {
          await ctx.store.deleteAsset({ ...asset, rev: a.rev as number });
          report(ctx, asset, { deleted: true });
          return { snapshot: await autoSnapshot(ctx, asset.siteId, "delete_asset") };
        } catch (e) {
          mapError(e);
        }
      },
    },
  ];
}
