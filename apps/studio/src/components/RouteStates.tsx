import { LayerCard, SkeletonLine } from "@cloudhal/ui";
import { type ErrorComponentProps, useRouter } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { ErrorBanner } from "./ErrorBanner.tsx";

/**
 * Shown in the content area while a screen's code chunk loads (only after the router's pending
 * delay, so fast navigations never flash it). DESIGN.md §5: skeleton rows, never a spinner page.
 */
export function RoutePending() {
  const t = useT();
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6 p-6">
      <span className="sr-only">{t("common.loading")}</span>
      <div className="flex max-w-md flex-col gap-2">
        <SkeletonLine minWidth={30} maxWidth={45} />
        <SkeletonLine minWidth={60} maxWidth={80} />
      </div>
      <LayerCard className="flex flex-col gap-3 p-4">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonLine key={i} minWidth={50} maxWidth={95} />
        ))}
      </LayerCard>
    </div>
  );
}

const STALE_CHUNK =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

/** True for errors caused by a deploy that removed the chunk this tab still references. */
export function isStaleChunkError(error: unknown): boolean {
  return error instanceof Error && STALE_CHUNK.test(error.message);
}

const RELOAD_KEY = "cloudhal.chunkReloadAt";

/**
 * Reloads once to pick up a newer deploy; a second failure within a minute is shown instead of
 * looping. Returns true when a reload was started.
 */
export function reloadForNewDeploy(
  storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.sessionStorage,
  reload: () => void = () => globalThis.location.reload(),
  now = Date.now(),
): boolean {
  try {
    const last = Number(storage?.getItem(RELOAD_KEY) ?? 0);
    if (now - last < 60_000) return false;
    storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    // storage unavailable: still try once
  }
  reload();
  return true;
}

/** Route error boundary: a stale chunk after a deploy reloads once; anything else is a banner. */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter();
  if (isStaleChunkError(error) && reloadForNewDeploy()) return <RoutePending />;
  return (
    <div className="p-6">
      <ErrorBanner
        error={error}
        onRetry={() => {
          reset();
          void router.invalidate();
        }}
      />
    </div>
  );
}
