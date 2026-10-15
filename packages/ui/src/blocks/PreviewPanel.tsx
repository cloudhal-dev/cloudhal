import {
  cn,
  LayerCard,
  LinkButton,
  RefreshButton,
  SkeletonLine,
  Tabs,
  Text,
} from "@cloudflare/kumo";
import { ArrowSquareOut, DeviceMobile, DeviceTablet, Monitor } from "@phosphor-icons/react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";

export type PreviewDevice = "desktop" | "tablet" | "mobile";

/**
 * Viewport width per device. Desktop fills the panel (text stays readable in a split view);
 * tablet and mobile render at their real width and are scaled down only when the panel is narrower.
 */
export const PREVIEW_DEVICE_WIDTH: Record<PreviewDevice, number | "fill"> = {
  desktop: "fill",
  tablet: 768,
  mobile: 390,
};

export interface PreviewPanelLabels {
  title: string;
  /** Accessible title of the iframe (e.g. "Preview of /about"). */
  frameTitle: string;
  device: string;
  desktop: string;
  tablet: string;
  mobile: string;
  reload: string;
  openInNewTab: string;
  loading: string;
}

export interface PreviewPanelProps {
  /** URL of the preview document (same origin; served with a sandboxing CSP). */
  src: string;
  /**
   * A draft document rendered by the server from unsaved changes (it carries the preview CSP in a
   * meta tag). When set, the frame shows it instead of `src`, updating in place as it changes;
   * `undefined` while the first one loads. "Open in new tab" still opens `src` (the saved version).
   */
  srcDoc?: string | undefined;
  /** Draft mode from the start: show `srcDoc` (a skeleton until the first one arrives), never `src`. */
  live?: boolean;
  /** With `srcDoc`: the frame shows a document but a newer one is on its way. */
  stale?: boolean;
  /** Bump to reload the frame, e.g. the document's `rev` after each save. */
  version?: string | number | undefined;
  labels: PreviewPanelLabels;
  /** Extra header content, e.g. an "Unsaved changes" badge. */
  status?: ReactNode;
  defaultDevice?: PreviewDevice;
  /** Height of the viewport area (CSS length). Ignored with `fill`. */
  height?: string;
  /** Fill the parent's height (the parent sets it, e.g. a sticky editor column). */
  fill?: boolean;
  /**
   * Live builds (RFC-0020 §6): each new `srcDoc` is merged into the shown document instead of
   * reloading it, so scroll position and open tabs survive. The frame then allows same-origin
   * access for the panel only; scripts stay off (`sandbox="allow-same-origin"`).
   */
  morph?: boolean;
  /** With `morph`: `data-section-id`s that just changed, outlined briefly and scrolled into view. */
  highlight?: readonly string[];
  /** With `morph`: picking a section or component in the preview (RFC-0020 §6 click-to-scope). */
  pick?: PreviewPick;
  className?: string;
}

/** A part of the previewed page: a section, or one component of a surface section. */
export interface PreviewTarget {
  sectionId: string;
  componentId?: string | undefined;
}

export interface PreviewPick {
  /** Picking now: the pointer outlines the part under it, a click picks it, Escape stops. */
  active: boolean;
  /** The picked part, outlined while it is on the page. */
  selected?: PreviewTarget | undefined;
  onPick: (target: PreviewTarget) => void;
  /** Escape while picking. */
  onCancel?: () => void;
  /** Accessible name of the picking layer ("Pick a part of the page"). */
  label: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The section or component at a point of the preview document (frame viewport coordinates). */
export function previewTargetAt(doc: Document, x: number, y: number): PreviewTarget | undefined {
  const el = doc.elementFromPoint(x, y);
  const section = el?.closest("[data-section-id]");
  const sectionId = section?.getAttribute("data-section-id");
  if (!el || !section || !sectionId) return undefined;
  const component = el.closest("[data-component-id]");
  const componentId =
    component && section.contains(component)
      ? (component.getAttribute("data-component-id") ?? undefined)
      : undefined;
  return componentId ? { sectionId, componentId } : { sectionId };
}

/** The element a target names in the preview document, if it is (still) there. */
export function previewElement(doc: Document, target: PreviewTarget): Element | undefined {
  const section = doc.querySelector(`[data-section-id="${CSS.escape(target.sectionId)}"]`);
  if (!section || !target.componentId) return section ?? undefined;
  return (
    section.querySelector(`[data-component-id="${CSS.escape(target.componentId)}"]`) ?? undefined
  );
}

const sameBox = (a: Box | undefined, b: Box | undefined) =>
  a === b || (!!a && !!b && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h);

/**
 * Merges a newer preview document into the shown one: `main`'s children are matched by
 * `data-section-id` and kept when unchanged, so only what changed is replaced. Anything else that
 * differs (the header, the title) is replaced as a whole.
 */
export function morphPreview(doc: Document, html: string): void {
  const next = new DOMParser().parseFromString(html, "text/html");
  if (doc.title !== next.title) doc.title = next.title;
  const main = doc.querySelector("main");
  const nextMain = next.querySelector("main");
  if (!main || !nextMain) {
    doc.body.replaceWith(doc.importNode(next.body, true));
    return;
  }
  const header = doc.querySelector("body > header");
  const nextHeader = next.querySelector("body > header");
  if (header && nextHeader && header.outerHTML !== nextHeader.outerHTML)
    header.replaceWith(doc.importNode(nextHeader, true));
  const byId = new Map<string, Element>();
  for (const child of Array.from(main.children)) {
    const id = child.getAttribute("data-section-id");
    if (id) byId.set(id, child);
  }
  const children = Array.from(nextMain.children).map((child) => {
    const id = child.getAttribute("data-section-id");
    const old = id ? byId.get(id) : undefined;
    return old && old.outerHTML === child.outerHTML ? old : doc.importNode(child, true);
  });
  main.replaceChildren(...children);
}

/** Outlines the changed sections for a moment and brings the last one into view. */
function flash(doc: Document, ids: readonly string[]): void {
  let last: Element | undefined;
  for (const id of ids) {
    const el = doc.querySelector(`[data-section-id="${CSS.escape(id)}"]`);
    if (!el) continue;
    last = el;
    el.animate(
      [
        { outline: "2px solid rgb(37 99 235)", outlineOffset: "4px" },
        { outline: "2px solid rgb(37 99 235 / 0)", outlineOffset: "4px" },
      ],
      { duration: 1600, easing: "ease-out" },
    );
  }
  last?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function withVersion(src: string, version: string | number | undefined, nonce: number): string {
  const v = `${version ?? 0}.${nonce}`;
  return `${src}${src.includes("?") ? "&" : "?"}v=${encodeURIComponent(v)}`;
}

/**
 * Live preview of a draft in a fully sandboxed iframe (`sandbox=""`: no scripts, no same-origin,
 * no forms), with a device-width switch that renders at the real viewport width and scales the
 * result to the panel, a reload button and "open in new tab". Used by every editor (DESIGN.md §2f).
 */
export function PreviewPanel({
  src,
  srcDoc,
  stale = false,
  live = false,
  version,
  labels,
  status,
  defaultDevice = "desktop",
  height = "min(78vh, 960px)",
  fill = false,
  morph = false,
  highlight,
  pick,
  className,
}: PreviewPanelProps) {
  const [device, setDevice] = useState<PreviewDevice>(defaultDevice);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const url = withVersion(src, version, nonce);
  const draft = live || srcDoc !== undefined;
  const frame = useRef<HTMLIFrameElement>(null);
  // Morphing: the frame loads the first document (and each reload's); later ones are merged in.
  const [shown, setShown] = useState<string | undefined>(srcDoc);
  if (morph && shown === undefined && srcDoc !== undefined) setShown(srcDoc);
  // biome-ignore lint/correctness/useExhaustiveDependencies: merge only when a new document arrives
  useEffect(() => {
    if (!morph || srcDoc === undefined || srcDoc === shown || loading) return;
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    morphPreview(doc, srcDoc);
    if (highlight?.length) flash(doc, highlight);
  }, [srcDoc]);

  // A new URL means a new document is loading. A draft document swaps in place (no skeleton on
  // every keystroke); only a reload remounts it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect must re-run when the URL changes
  useEffect(() => {
    if (!draft) setLoading(true);
  }, [url]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a reload remounts the draft frame
  useEffect(() => {
    if (draft) setLoading(true);
    if (morph) setShown(srcDoc);
  }, [nonce]);
  const waiting = draft ? srcDoc === undefined : false;

  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const measure = () => setBox({ width: el.clientWidth, height: el.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const preset = PREVIEW_DEVICE_WIDTH[device];
  const deviceWidth = preset === "fill" ? box.width || 1024 : preset;
  const scale = box.width > 0 ? Math.min(1, box.width / deviceWidth) : 1;
  const frameHeight = box.height > 0 ? box.height / scale : 800;
  // Picking (RFC-0020 §6): a layer over the frame finds the part under the pointer by coordinates,
  // so the frame keeps running no scripts and its document is never changed.
  const layer = useRef<HTMLButtonElement>(null);
  const [hover, setHover] = useState<Box | undefined>();
  const [chosen, setChosen] = useState<Box | undefined>();
  const picking = morph && !!pick?.active;
  const selected = morph ? pick?.selected : undefined;
  const boxOf = (el: Element | undefined): Box | undefined => {
    if (!el) return undefined;
    const r = el.getBoundingClientRect();
    return { x: r.left * scale, y: r.top * scale, w: r.width * scale, h: r.height * scale };
  };
  const pointAt = (e: { clientX: number; clientY: number }) => {
    const doc = frame.current?.contentDocument;
    const r = layer.current?.getBoundingClientRect();
    if (!doc || !r) return undefined;
    return previewTargetAt(doc, (e.clientX - r.left) / scale, (e.clientY - r.top) / scale);
  };
  // The picked part's outline follows scrolling and every merged version.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the loop reads the latest values
  useEffect(() => {
    if (!selected) {
      setChosen(undefined);
      return;
    }
    let raf = 0;
    const tick = () => {
      const doc = frame.current?.contentDocument;
      const next = doc ? boxOf(previewElement(doc, selected)) : undefined;
      setChosen((prev) => (sameBox(prev, next) ? prev : next));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [selected?.sectionId, selected?.componentId, scale]);
  useEffect(() => {
    if (!picking) {
      setHover(undefined);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") pick?.onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [picking, pick]);

  const icon = { desktop: Monitor, tablet: DeviceTablet, mobile: DeviceMobile };

  return (
    <LayerCard className={cn(fill && "h-full", className)}>
      <LayerCard.Secondary className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <Text variant="heading" as="h2">
            {labels.title}
          </Text>
          {status}
        </div>
        <div className="flex items-center gap-1">
          <Tabs
            variant="segmented"
            size="sm"
            value={device}
            onValueChange={(v) => setDevice(v as PreviewDevice)}
            tabs={(["desktop", "tablet", "mobile"] as const).map((d) => {
              const DeviceIcon = icon[d];
              return {
                value: d,
                label: (
                  <span className="flex items-center gap-1.5" title={labels[d]}>
                    <DeviceIcon size={14} aria-hidden />
                    <span className="sr-only sm:not-sr-only">{labels[d]}</span>
                  </span>
                ),
              };
            })}
          />
          <RefreshButton
            variant="ghost"
            size="sm"
            aria-label={labels.reload}
            loading={loading || waiting || stale}
            onClick={() => setNonce((n) => n + 1)}
          />
          <LinkButton
            href={url}
            external
            variant="ghost"
            size="sm"
            shape="square"
            icon={ArrowSquareOut}
            aria-label={labels.openInNewTab}
            title={labels.openInNewTab}
          />
        </div>
      </LayerCard.Secondary>
      <LayerCard.Primary className={cn("p-0", fill && "min-h-0 flex-1")}>
        <div
          ref={viewport}
          className={cn(
            "relative overflow-hidden rounded-lg bg-kumo-recessed",
            fill && "min-h-0 flex-1",
          )}
          style={fill ? undefined : { height }}
          aria-busy={loading || waiting || stale}
          data-device={device}
        >
          <div
            className={cn(
              "relative mx-auto h-full overflow-hidden",
              preset !== "fill" && deviceWidth * scale < box.width && "ring ring-kumo-line",
            )}
            style={{ width: Math.min(box.width || deviceWidth, deviceWidth * scale) }}
          >
            <iframe
              key={draft ? `draft.${nonce}` : url}
              title={labels.frameTitle}
              ref={frame}
              {...(draft ? { srcDoc: morph ? shown : srcDoc } : { src: url })}
              sandbox={morph ? "allow-same-origin" : ""}
              referrerPolicy="no-referrer"
              onLoad={() => setLoading(false)}
              className="block origin-top-left border-0"
              // The frame hosts the visitor-facing site (its own theme, not Kumo), so it keeps a
              // light canvas in both modes instead of inheriting the admin surface.
              style={{
                width: deviceWidth,
                height: frameHeight,
                transform: `scale(${scale})`,
                colorScheme: "light",
                background: "white",
              }}
            />
            {chosen && (
              <div
                aria-hidden
                data-testid="preview-selected"
                className="pointer-events-none absolute rounded-sm ring-2 ring-kumo-brand"
                style={{ left: chosen.x, top: chosen.y, width: chosen.w, height: chosen.h }}
              />
            )}
            {picking && (
              <button
                type="button"
                ref={layer}
                data-testid="preview-pick-layer"
                aria-label={pick?.label}
                className="absolute inset-0 cursor-crosshair border-0 bg-transparent p-0"
                onKeyDown={(e) => {
                  if (e.key === "Escape") pick?.onCancel?.();
                }}
                onMouseMove={(e) => {
                  const doc = frame.current?.contentDocument;
                  const target = pointAt(e);
                  const next = doc && target ? boxOf(previewElement(doc, target)) : undefined;
                  setHover((prev) => (sameBox(prev, next) ? prev : next));
                }}
                onMouseLeave={() => setHover(undefined)}
                onWheel={(e) =>
                  frame.current?.contentWindow?.scrollBy(e.deltaX / scale, e.deltaY / scale)
                }
                onClick={(e) => {
                  const target = pointAt(e);
                  if (target) pick?.onPick(target);
                }}
              >
                {hover && (
                  <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-sm bg-kumo-brand/15 ring-2 ring-kumo-brand"
                    style={{ left: hover.x, top: hover.y, width: hover.w, height: hover.h }}
                  />
                )}
              </button>
            )}
          </div>
          {(loading || waiting) && (
            <div
              className="absolute inset-0 flex flex-col gap-4 bg-kumo-base px-8 py-10"
              role="status"
              aria-label={labels.loading}
            >
              <SkeletonLine minWidth={40} maxWidth={60} />
              <SkeletonLine minWidth={70} maxWidth={90} />
              <SkeletonLine minWidth={60} maxWidth={85} />
              <SkeletonLine minWidth={30} maxWidth={50} />
            </div>
          )}
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}
