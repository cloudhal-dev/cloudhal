import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ImagePreview,
  Input,
  InsetPanel,
  LayerDialog,
  MediaDropZone,
  MediaKindFrame,
  Meter,
  Text,
} from "@cloudhal/ui";
import { CheckCircle, MapPin, UploadSimple, WarningCircle, X } from "@phosphor-icons/react";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n, useT } from "../i18n/index.tsx";
import { ApiRequestError, type AssetListItem, api, type UploadFileRequest } from "../lib/api.ts";
import {
  type AssetKind,
  checkFile,
  formatSize,
  placeholdersOf,
  readImageInfo,
  sha256OfFile,
  typeLabel,
  UPLOAD_FILES_PER_REQUEST,
  type UploadErrorCode,
  uploadErrorCode,
} from "../lib/media.ts";
import { isOpenTicket, putUpload, UploadTransportError } from "../lib/uploads.ts";
import { KindIcon } from "./Media.tsx";

export type UploadState =
  | "preparing"
  | "ready"
  | "uploading"
  | "done"
  | "existing"
  | "error"
  | "canceled";

export interface UploadItem {
  id: string;
  file: File;
  state: UploadState;
  mediaType?: string;
  kind?: Exclude<AssetKind, "other">;
  sha256?: string;
  /** Raster images: the size and whether the photo carries GPS (RFC-0004 §5.3). */
  image?: { width: number; height: number; gps: boolean };
  lqip?: string;
  color?: string;
  alt: string;
  decorative: boolean;
  keepMetadata: boolean;
  /** 0–100 while uploading. */
  progress: number;
  error?: UploadErrorCode;
  /** The asset it became (new or already in the library). */
  result?: AssetListItem;
}

const isImage = (item: UploadItem) => item.kind === "image";
/** An image says what it shows, or is marked decorative (RFC-0004 §5.6, §8). */
export const described = (item: UploadItem) =>
  !isImage(item) || item.decorative || item.alt.trim().length > 0;

let counter = 0;
const nextId = () => `upload-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Parallel PUTs per batch: enough to fill the pipe, few enough to keep progress readable. */
const PARALLEL = 3;

/**
 * The upload queue of the library and the picker (DESIGN.md §2u): files are checked against the
 * server's type table, hashed (the server dedupes before transfer) and, for images, read for their
 * size and GPS; images then wait for alt text; `start` asks for single-use tickets in one request
 * and streams each file to its ticket with progress. Bytes leave Studio only through `putUpload`.
 */
export function useMediaUpload(
  siteId: string,
  options: { onUploaded?: (items: AssetListItem[]) => void } = {},
) {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const onUploaded = useRef(options.onUploaded);
  onUploaded.current = options.onUploaded;
  const patch = useCallback((id: string, next: Partial<UploadItem>) => {
    setItems((all) => all.map((i) => (i.id === id ? { ...i, ...next } : i)));
  }, []);

  const latest = useRef(items);
  latest.current = items;

  const prepare = useCallback(
    async (item: UploadItem) => {
      try {
        const [sha256, bytes] = await Promise.all([
          sha256OfFile(item.file),
          isImage(item) ? item.file.arrayBuffer() : Promise.resolve(undefined),
        ]);
        const image =
          bytes && item.mediaType
            ? readImageInfo(new Uint8Array(bytes), item.mediaType)
            : undefined;
        const { lqip, color } = image ? await placeholdersOf(item.file) : {};
        patch(item.id, {
          state: "ready",
          sha256,
          ...(image ? { image } : {}),
          ...(lqip ? { lqip } : {}),
          ...(color ? { color } : {}),
        });
      } catch {
        patch(item.id, { state: "error", error: "unknown" });
      }
    },
    [patch],
  );

  const add = useCallback(
    (files: File[]) => {
      // At most 20 files wait at a time (one ticket request, RFC-0004 §5.1).
      const waiting = latest.current.filter(
        (i) => i.state === "ready" || i.state === "preparing",
      ).length;
      const room = Math.max(0, UPLOAD_FILES_PER_REQUEST - waiting);
      const added: UploadItem[] = files.map((file, n) => {
        const check = checkFile(file);
        const base: UploadItem = {
          id: nextId(),
          file,
          state: "preparing",
          alt: "",
          decorative: false,
          keepMetadata: false,
          progress: 0,
          ...(check.mediaType ? { mediaType: check.mediaType } : {}),
          ...(check.kind ? { kind: check.kind } : {}),
        };
        if (n >= room) return { ...base, state: "error", error: "too_many_files" };
        if (check.problem) return { ...base, state: "error", error: check.problem };
        return base;
      });
      setItems((current) => [...current, ...added]);
      for (const item of added) if (item.state === "preparing") void prepare(item);
    },
    [prepare],
  );

  const remove = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
    setItems((all) => all.filter((i) => i.id !== id));
  }, []);
  const cancel = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      patch(id, { state: "canceled" });
    },
    [patch],
  );
  const reset = useCallback(() => {
    for (const c of controllers.current.values()) c.abort();
    controllers.current.clear();
    setItems([]);
  }, []);

  const ready = items.filter((i) => i.state === "ready");
  const canStart = ready.length > 0 && ready.every(described);
  const busy = items.some((i) => i.state === "uploading" || i.state === "preparing");

  const start = useCallback(async () => {
    const batch = items.filter((i) => i.state === "ready" && described(i));
    if (batch.length === 0) return;
    for (const i of batch) patch(i.id, { state: "uploading", progress: 0 });
    const requests: UploadFileRequest[] = batch.map((i) => ({
      filename: i.file.name,
      bytes: i.file.size,
      mediaType: i.mediaType ?? i.file.type,
      ...(i.sha256 ? { sha256: i.sha256 } : {}),
      ...(isImage(i) && i.alt.trim() && !i.decorative ? { alt: i.alt.trim() } : {}),
      ...(isImage(i) && i.decorative ? { decorative: true } : {}),
      ...(i.image?.gps && i.keepMetadata ? { keepMetadata: true } : {}),
      ...(i.lqip || i.color
        ? { image: { ...(i.lqip ? { lqip: i.lqip } : {}), ...(i.color ? { color: i.color } : {}) } }
        : {}),
    }));
    let tickets: Awaited<ReturnType<typeof api.assets.requestUploads>>["files"];
    try {
      tickets = (await api.assets.requestUploads(siteId, requests)).files;
    } catch (e) {
      const code = e instanceof ApiRequestError ? uploadErrorCode(e.body.error) : "network";
      for (const i of batch) patch(i.id, { state: "error", error: code });
      return;
    }
    const finished: AssetListItem[] = [];
    const queue = tickets.map((ticket, n) => ({ ticket, item: batch[n] as UploadItem }));
    const work = async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const { ticket, item } = next;
        if ("existing" in ticket) {
          patch(item.id, { state: "existing", progress: 100, result: ticket.existing });
          finished.push(ticket.existing);
          continue;
        }
        if (!isOpenTicket(ticket)) {
          patch(item.id, { state: "error", error: uploadErrorCode(ticket.error.code) });
          continue;
        }
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        try {
          const result = await putUpload(ticket, item.file, {
            signal: controller.signal,
            onProgress: (loaded, total) =>
              patch(item.id, { progress: Math.min(99, Math.round((loaded / total) * 100)) }),
          });
          patch(item.id, {
            state: result.existing ? "existing" : "done",
            progress: 100,
            result,
          });
          finished.push(result);
        } catch (e) {
          if (e instanceof UploadTransportError && e.code === "aborted")
            patch(item.id, { state: "canceled" });
          else
            patch(item.id, {
              state: "error",
              error:
                e instanceof ApiRequestError
                  ? uploadErrorCode(e.body.error)
                  : e instanceof UploadTransportError
                    ? "network"
                    : "unknown",
            });
        } finally {
          controllers.current.delete(item.id);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(PARALLEL, queue.length) }, work));
    if (finished.length) {
      await qc.invalidateQueries({ queryKey: ["assets", siteId] });
      onUploaded.current?.(finished);
    }
  }, [items, patch, qc, siteId]);

  // Abort what is still running when the queue goes away.
  useEffect(
    () => () => {
      for (const c of controllers.current.values()) c.abort();
    },
    [],
  );

  return { items, add, remove, cancel, reset, start, patch, canStart, busy, ready: ready.length };
}

export type MediaUpload = ReturnType<typeof useMediaUpload>;

/** A local preview of a chosen image (an object URL, revoked when the row goes away). */
function useObjectUrl(file: File, enabled: boolean): string | undefined {
  const url = useMemo(
    () =>
      enabled && typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : undefined,
    [file, enabled],
  );
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL?.(url);
    },
    [url],
  );
  return url;
}

function StatusLine({ item }: { item: UploadItem }) {
  const t = useT("media");
  if (item.state === "uploading")
    return (
      <Meter
        label={t("media.upload.progress")}
        value={item.progress}
        customValue={t("media.upload.percent", { percent: item.progress })}
      />
    );
  if (item.state === "error")
    return (
      <span className="flex items-start gap-1.5 text-kumo-danger" data-upload-error={item.error}>
        <span className="flex h-lh items-center">
          <WarningCircle size={14} weight="fill" aria-hidden />
        </span>
        <Text as="span" size="sm" variant="error">
          {t(`media.upload.errors.${item.error ?? "unknown"}`)}
        </Text>
      </span>
    );
  if (item.state === "done" || item.state === "existing")
    return (
      <span className="flex items-center gap-1.5">
        <CheckCircle size={14} weight="fill" className="text-kumo-success" aria-hidden />
        <Text as="span" size="sm" variant="secondary">
          {t(`media.upload.status.${item.state}`)}
        </Text>
      </span>
    );
  return (
    <Text as="span" size="sm" variant="secondary">
      {t(`media.upload.status.${item.state}`)}
    </Text>
  );
}

function UploadRow({ item, upload }: { item: UploadItem; upload: MediaUpload }) {
  const t = useT("media");
  const { locale } = useI18n("media");
  const image = isImage(item);
  const preview = useObjectUrl(item.file, image && item.state !== "error");
  const editable = item.state === "ready" || item.state === "preparing";
  const showAltError = item.state === "ready" && !described(item);
  return (
    <div
      className="grid min-w-0 gap-3 py-3 first:pt-0 last:pb-0"
      data-testid="upload-row"
      data-state={item.state}
    >
      <div className="flex min-w-0 items-start gap-3">
        {image && preview ? (
          <ImagePreview
            size="thumb"
            src={preview}
            alt=""
            labels={{
              empty: t("media.preview.empty"),
              loading: t("media.preview.loading"),
              error: t("media.preview.broken"),
            }}
          />
        ) : (
          <MediaKindFrame
            size="thumb"
            icon={<KindIcon kind={item.kind} size={16} />}
            label={item.mediaType ? typeLabel(item.mediaType) : ""}
          />
        )}
        <div className="grid min-w-0 flex-1 gap-1">
          <span className="flex min-w-0 items-center gap-2">
            <Text as="span" truncate>
              {item.file.name}
            </Text>
            {item.mediaType && (
              <span className="inline-flex shrink-0">
                <Badge variant="outline">{typeLabel(item.mediaType)}</Badge>
              </span>
            )}
          </span>
          <Text as="span" variant="secondary" size="sm">
            {formatSize(item.file.size, locale)}
            {item.image ? ` · ${item.image.width} × ${item.image.height}` : ""}
          </Text>
          <StatusLine item={item} />
        </div>
        {item.state === "uploading" ? (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={<X />}
            aria-label={t("media.upload.cancel", { name: item.file.name })}
            title={t("media.upload.cancel", { name: item.file.name })}
            onClick={() => upload.cancel(item.id)}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            shape="square"
            icon={<X />}
            aria-label={t("media.upload.remove", { name: item.file.name })}
            title={t("media.upload.remove", { name: item.file.name })}
            onClick={() => upload.remove(item.id)}
          />
        )}
      </div>
      {image && editable && (
        <div className="grid min-w-0 gap-3">
          <Input
            label={t("media.upload.alt")}
            value={item.alt}
            placeholder={t("media.upload.altPlaceholder")}
            onValueChange={(v) => upload.patch(item.id, { alt: v })}
            description={t("media.upload.altHint")}
            error={showAltError ? t("media.upload.altRequired") : undefined}
            disabled={item.decorative}
            maxLength={500}
            className="w-full"
            data-testid="upload-alt"
          />
          <Checkbox
            label={t("media.upload.decorative")}
            checked={item.decorative}
            onCheckedChange={(v: boolean) => upload.patch(item.id, { decorative: v })}
          />
          {item.image?.gps && (
            <div className="grid gap-2" data-testid="upload-gps">
              <Banner
                variant="alert"
                size="sm"
                icon={<MapPin weight="fill" />}
                title={t("media.upload.gpsTitle")}
                description={t("media.upload.gpsDescription")}
              />
              <Checkbox
                label={t("media.upload.keepMetadata")}
                checked={item.keepMetadata}
                onCheckedChange={(v: boolean) => upload.patch(item.id, { keepMetadata: v })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * The drop zone and the queue: one row per file with its check, its alt text (images), the GPS
 * choice (photos with a location) and its progress or error in words.
 */
export function UploadPanel({
  upload,
  accept,
  multiple = true,
  disabledReason,
  description,
  inlineStart = false,
}: {
  upload: MediaUpload;
  accept: string;
  multiple?: boolean;
  disabledReason?: string | undefined;
  /** What the zone takes ("JPEG, PNG… up to 20 MB"). */
  description: string;
  /** Show an "Upload" button under the queue (the picker, whose primary action picks). */
  inlineStart?: boolean;
}) {
  const t = useT("media");
  const { items } = upload;
  const done = items.filter((i) => i.state === "done" || i.state === "existing").length;
  return (
    <div className="grid min-w-0 gap-4">
      <MediaDropZone
        onFiles={upload.add}
        accept={accept}
        multiple={multiple}
        disabledReason={disabledReason}
        labels={{
          title: t("media.drop.title"),
          description,
          choose: t("media.drop.choose"),
          release: t("media.drop.release"),
        }}
        data-testid="media-drop"
      />
      {items.length > 0 && (
        <InsetPanel label={t("media.upload.queueLabel")}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Text as="span" bold>
              {t("media.upload.queueLabel")}
            </Text>
            <Text as="span" variant="secondary" size="sm">
              {t("media.upload.summary", { done, total: items.length })}
            </Text>
          </div>
          <div className="grid divide-y divide-kumo-hairline" data-testid="upload-queue">
            {items.map((item) => (
              <UploadRow key={item.id} item={item} upload={upload} />
            ))}
          </div>
          {inlineStart && upload.ready > 0 && (
            <div className="flex justify-end">
              <Button
                variant="secondary"
                icon={<UploadSimple />}
                disabled={!upload.canStart}
                loading={upload.busy}
                onClick={() => void upload.start()}
                data-testid="upload-start"
              >
                {t("media.upload.inlineStart")}
              </Button>
            </div>
          )}
        </InsetPanel>
      )}
    </div>
  );
}

/**
 * Library › Upload (`LayerDialog lg`): the panel above, "Upload n files" once every image is
 * described, then "Done". Opening with files (a drop on the library, the header's file button)
 * queues them at once.
 */
export function UploadDialog({
  siteId,
  open,
  onOpenChange,
  initialFiles,
  accept,
  disabledReason,
}: {
  siteId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialFiles: File[];
  accept: string;
  disabledReason?: string | undefined;
}) {
  const t = useT("media");
  const upload = useMediaUpload(siteId);
  const seeded = useRef<File[] | undefined>(undefined);
  useEffect(() => {
    if (open && initialFiles.length && seeded.current !== initialFiles) {
      seeded.current = initialFiles;
      upload.add(initialFiles);
    }
  }, [open, initialFiles, upload.add]);
  const started = upload.items.some((i) => i.state !== "ready" && i.state !== "preparing");
  const pending = upload.ready > 0;
  const close = (next: boolean) => {
    if (next) return onOpenChange(true);
    onOpenChange(false);
    upload.reset();
    seeded.current = undefined;
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={close} dismissDisabled={upload.busy}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("media.upload.title")}</LayerDialog.Title>
        <LayerDialog.Description>{t("media.upload.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <UploadPanel
            upload={upload}
            accept={accept}
            disabledReason={disabledReason}
            description={t("media.drop.description")}
          />
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            disabled={pending ? !upload.canStart : !started || upload.busy}
            loading={upload.busy}
            onClick={() => (pending ? void upload.start() : close(false))}
            data-testid="upload-primary"
          >
            {pending ? t("media.upload.start", { count: upload.ready }) : t("media.upload.done")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
