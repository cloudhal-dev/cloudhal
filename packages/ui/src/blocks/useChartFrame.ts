import type { ECharts } from "echarts/core";
import { useEffect, useRef } from "react";
import { echarts } from "./charts.ts";
import { useReducedMotion } from "./useChartPalette.ts";

/** The ECharts instances drawn inside `frame` (Kumo marks their roots with `_echarts_instance_`). */
function chartsIn(frame: HTMLElement | null): ECharts[] {
  if (!frame) return [];
  return [...frame.querySelectorAll<HTMLElement>("[_echarts_instance_]")]
    .map((el) => echarts.getInstanceByDom(el))
    .filter((chart): chart is ECharts => chart !== undefined && !chart.isDisposed());
}

/**
 * Shared upkeep for the ECharts-backed blocks, applied to every chart inside the frame:
 * - **Size.** Kumo's chart skips its resize observer's first report, so a container that changes
 *   width right after mount (fonts arriving, the sidebar collapsing, a viewport change) leaves the
 *   chart at its first width. The frame observes itself and resizes its charts on every change.
 *   (The frame must let its children shrink: a grid with `grid-cols-1`, or `min-w-0` children.)
 * - **Motion.** Kumo turns ECharts' animations on; with `prefers-reduced-motion` they go off
 *   again after every option update.
 * - **Extra options** Kumo does not expose (`patch`, e.g. hiding overlapping axis labels) are
 *   merged after every render; Kumo merges its own options, so they stay.
 */
export function useChartFrame<W extends HTMLElement = HTMLDivElement>(
  patch?: Record<string, unknown>,
) {
  const frameRef = useRef<W | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const el = frameRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let last = -1;
    const ro = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      if (width === last) return;
      last = width;
      // A short debounce rather than an animation frame: frames do not run in hidden tabs, and a
      // chart resized while hidden must already fit when the tab comes back.
      clearTimeout(timer);
      timer = setTimeout(() => {
        for (const chart of chartsIn(el)) chart.resize();
      }, 50);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    for (const chart of chartsIn(frameRef.current)) {
      if (patch) chart.setOption(patch);
      if (reducedMotion) chart.setOption({ animation: false });
    }
  });

  return frameRef;
}
