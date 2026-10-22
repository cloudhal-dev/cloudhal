import { useCallback } from "react";
import { useT } from "../i18n/index.tsx";
import { ELEVATION_PRESETS } from "../lib/elevation.ts";

/**
 * A duration in the same short words as the elevation presets: "15 min", "1 hour", "1 day",
 * and "1 hr 30 min" / "1 sa 30 dk" for anything else (Intl's short Turkish adds full stops).
 */
export function useShortDuration() {
  const t = useT();
  return useCallback(
    (minutes: number) => {
      const standard = ELEVATION_PRESETS.find((p) => p === minutes);
      if (standard !== undefined) return t(`agents.elevate.presets.${standard}`);
      const hours = Math.floor(minutes / 60);
      const rest = minutes % 60;
      return [
        hours > 0 ? t("approvals.elevation.presetHours", { count: hours }) : "",
        rest > 0 ? t("approvals.elevation.presetMinutes", { count: rest }) : "",
      ]
        .filter(Boolean)
        .join(" ");
    },
    [t],
  );
}
