import { Button, cn, Text, Tooltip, useLinkComponent } from "@cloudflare/kumo";
import { Check, UploadSimple } from "@phosphor-icons/react";
import {
  type ClipboardEvent,
  type DragEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";

// ---- MediaDropZone ------------------------------------------------------------------------------

export interface MediaDropZoneLabels {
  /** "Drop files here" — the area's heading and accessible name. */
  title: string;
  /** Accepted types and limits, under the heading (`area` only). */
  description?: string;
  /** The file button ("Choose files"). */
  choose: string;
  /** Shown while files are dragged over ("Release to upload"). */
  release: string;
}

export interface MediaDropZoneProps {
  onFiles: (files: File[]) => void;
  labels: MediaDropZoneLabels;
  /** `accept` of the file input (MIME types and extensions). */
  accept?: string;
  multiple?: boolean;
  /** The person may not upload: the button is disabled with the reason as its tooltip. */
  disabledReason?: string | undefined;
  /**
   * `area`: a dashed box with an icon, text and the file button (dialogs, the picker).
   * `overlay`: wraps `children` (a library) and shows a dashed overlay while files are dragged
   * over it; the file button lives elsewhere (`MediaDropZone` exposes none).
   */
  variant?: "area" | "overlay";
  children?: ReactNode;
  className?: string;
  "data-testid"?: string;
}

function filesOf(list: FileList | null | undefined): File[] {
  return list ? Array.from(list) : [];
}

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

/**
 * Where files come in (RFC-0004 §8, DESIGN.md §2u): drag and drop, paste from the clipboard while
 * the area has focus, or the file button. Kumo has no drop zone, so it lives here; the only raw
 * file `<input>` in Studio is inside it. Nothing is uploaded here — `onFiles` hands the files on.
 */
export function MediaDropZone({
  onFiles,
  labels,
  accept,
  multiple = true,
  disabledReason,
  variant = "area",
  children,
  className,
  "data-testid": testId,
}: MediaDropZoneProps) {
  const input = useRef<HTMLInputElement>(null);
  const depth = useRef(0);
  const [over, setOver] = useState(false);
  const titleId = useId();
  const disabled = disabledReason !== undefined;
  const take = (files: File[]) => {
    if (disabled || files.length === 0) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };
  const handlers = {
    onDragEnter: (e: DragEvent<HTMLDivElement>) => {
      if (disabled || !carriesFiles(e)) return;
      e.preventDefault();
      depth.current += 1;
      setOver(true);
    },
    onDragOver: (e: DragEvent<HTMLDivElement>) => {
      if (disabled || !carriesFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: () => {
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    },
    onDrop: (e: DragEvent<HTMLDivElement>) => {
      if (disabled || !carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      take(filesOf(e.dataTransfer?.files));
    },
    onPaste: (e: ClipboardEvent<HTMLDivElement>) => {
      const files = filesOf(e.clipboardData?.files);
      if (files.length === 0) return;
      e.preventDefault();
      take(files);
    },
  };
  const picker = (
    <input
      ref={input}
      type="file"
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      accept={accept}
      multiple={multiple}
      onChange={(e) => {
        take(filesOf(e.currentTarget.files));
        e.currentTarget.value = "";
      }}
    />
  );
  if (variant === "overlay")
    return (
      <div
        {...handlers}
        className={cn("relative min-w-0", className)}
        data-dragging={over || undefined}
        data-testid={testId}
      >
        {children}
        {over && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-kumo-brand bg-kumo-tint/90"
          >
            <span className="flex items-center gap-2 text-kumo-default">
              <UploadSimple size={20} />
              <Text as="span" bold>
                {labels.release}
              </Text>
            </span>
          </div>
        )}
      </div>
    );
  return (
    // biome-ignore lint/a11y/useSemanticElements: a drop target with a button inside, not a fieldset
    <div
      {...handlers}
      role="group"
      aria-labelledby={titleId}
      // Focusable so a pasted file lands here.
      // biome-ignore lint/a11y/noNoninteractiveTabindex: paste target
      tabIndex={0}
      data-dragging={over || undefined}
      data-testid={testId}
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-5 py-6 text-center outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
        over ? "border-kumo-brand bg-kumo-tint" : "border-kumo-line bg-kumo-base",
        className,
      )}
    >
      <span className="flex size-10 items-center justify-center rounded-full bg-kumo-recessed text-kumo-subtle">
        <UploadSimple size={20} aria-hidden />
      </span>
      <span className="grid gap-1.5">
        <span id={titleId}>
          <Text as="span" bold>
            {over ? labels.release : labels.title}
          </Text>
        </span>
        {labels.description && (
          <Text as="span" variant="secondary" size="sm">
            {labels.description}
          </Text>
        )}
      </span>
      {picker}
      <Button
        variant="secondary"
        icon={<UploadSimple />}
        onClick={() => input.current?.click()}
        disabled={disabled}
        title={disabledReason}
      >
        {labels.choose}
      </Button>
    </div>
  );
}

/** Opens the system file chooser from any button (the library header's "Upload"). */
export function useFileChooser(
  onFiles: (files: File[]) => void,
  options: { accept?: string; multiple?: boolean } = {},
): { open: () => void; input: ReactNode } {
  const ref = useRef<HTMLInputElement>(null);
  return {
    open: () => ref.current?.click(),
    input: (
      <input
        ref={ref}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        accept={options.accept}
        multiple={options.multiple ?? true}
        onChange={(e) => {
          const files = filesOf(e.currentTarget.files);
          e.currentTarget.value = "";
          if (files.length) onFiles(files);
        }}
      />
    ),
  };
}

// ---- MediaGrid / MediaTile ----------------------------------------------------------------------

/** Tiles in as many columns as fit (at least 10 rem each), for the library and the picker. */
export function MediaGrid({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** Accessible name of the list. */
  label: string;
  className?: string;
}) {
  return (
    <ul
      aria-label={label}
      className={cn("grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-4", className)}
    >
      {children}
    </ul>
  );
}

export interface MediaTileProps {
  /** An `ImagePreview size="tile"`, or a `MediaKindFrame` for files that are not images. */
  preview: ReactNode;
  title: string;
  /** One muted line: "JPEG · 482 KB". */
  meta?: ReactNode;
  /** Small badges over the frame's corner (retired, missing alt, uses). */
  badges?: ReactNode;
  /** Link to the file's page (library). */
  href?: string;
  /** Picker mode: the tile is a toggle button. */
  onSelect?: () => void;
  selected?: boolean;
  /** Picker mode: the tile cannot be chosen; the reason is its tooltip. */
  disabledReason?: string | undefined;
  "data-testid"?: string;
}

/**
 * One file in a grid: its frame, name and one meta line; a link in the library, a toggle in the
 * picker (a check and the brand ring when selected). Kumo has no media tile.
 */
export function MediaTile({
  preview,
  title,
  meta,
  badges,
  href,
  onSelect,
  selected = false,
  disabledReason,
  "data-testid": testId,
}: MediaTileProps) {
  const LinkComponent = useLinkComponent();
  const body = (
    <>
      <span className="relative block">
        {preview}
        {badges && (
          <span className="absolute top-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] flex-wrap gap-1">
            {badges}
          </span>
        )}
        {selected && (
          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-kumo-brand text-kumo-inverse">
            <Check size={14} weight="bold" aria-hidden />
          </span>
        )}
      </span>
      <span className="grid min-w-0 gap-0.5 px-1 pt-2 pb-1 text-left">
        <Text as="span" truncate>
          {title}
        </Text>
        {meta && (
          <Text as="span" variant="secondary" size="xs" truncate>
            {meta}
          </Text>
        )}
      </span>
    </>
  );
  const frame = cn(
    "block min-w-0 rounded-lg p-1.5 outline-none focus-visible:ring-2 focus-visible:ring-kumo-focus",
    selected ? "bg-kumo-tint ring-2 ring-kumo-brand" : "hover:bg-kumo-tint",
  );
  let tile: ReactNode;
  if (href) {
    tile = (
      <LinkComponent href={href} className={frame} data-testid={testId}>
        {body}
      </LinkComponent>
    );
  } else {
    const disabled = disabledReason !== undefined;
    const button = (
      <button
        type="button"
        aria-pressed={selected}
        aria-disabled={disabled || undefined}
        onClick={() => !disabled && onSelect?.()}
        className={cn(frame, "w-full", disabled && "cursor-not-allowed opacity-60")}
        data-testid={testId}
      >
        {body}
      </button>
    );
    tile = disabledReason ? <Tooltip content={disabledReason} render={button} /> : button;
  }
  return <li className="min-w-0">{tile}</li>;
}

/**
 * The frame of a file that is not shown as an image: its kind's icon and its extension, in the
 * same 4:3 frame as an image tile (`size="thumb"` for table rows).
 */
export function MediaKindFrame({
  icon,
  label,
  size = "tile",
}: {
  icon: ReactNode;
  /** The extension or type ("PDF", "CSV"). */
  label: string;
  size?: "tile" | "thumb" | "card";
}) {
  return (
    <span
      className={cn(
        "flex min-w-0 flex-col items-center justify-center gap-1 bg-kumo-recessed text-kumo-subtle ring ring-kumo-hairline",
        size === "thumb"
          ? "aspect-video w-14 shrink-0 rounded-md"
          : size === "card"
            ? "aspect-[1.91/1] w-full rounded-lg"
            : "aspect-[4/3] w-full rounded-md",
      )}
    >
      {icon}
      {size !== "thumb" && (
        <Text as="span" variant="secondary" size="xs">
          {label}
        </Text>
      )}
    </span>
  );
}
