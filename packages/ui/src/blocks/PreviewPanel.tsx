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
  className?: string;
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
  version,
  labels,
  status,
  defaultDevice = "desktop",
  height = "min(78vh, 960px)",
  fill = false,
  className,
}: PreviewPanelProps) {
  const [device, setDevice] = useState<PreviewDevice>(defaultDevice);
  const [nonce, setNonce] = useState(0);
  const [loading, setLoading] = useState(true);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const viewport = useRef<HTMLDivElement>(null);
  const url = withVersion(src, version, nonce);

  // A new URL means a new document is loading.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the effect must re-run when the URL changes
  useEffect(() => setLoading(true), [url]);

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
            loading={loading}
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
          aria-busy={loading}
          data-device={device}
        >
          <div
            className={cn(
              "mx-auto h-full overflow-hidden",
              preset !== "fill" && deviceWidth * scale < box.width && "ring ring-kumo-line",
            )}
            style={{ width: Math.min(box.width || deviceWidth, deviceWidth * scale) }}
          >
            <iframe
              key={url}
              title={labels.frameTitle}
              src={url}
              sandbox=""
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
          </div>
          {loading && (
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
