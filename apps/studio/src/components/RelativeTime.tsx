import { Text, Tooltip } from "@cloudhal/ui";
import { useI18n } from "../i18n/index.tsx";
import { absoluteTime, relativeTime } from "../lib/activity.ts";
import { useNow } from "./useNow.ts";

/** "5 minutes ago", with the exact timestamp in a tooltip (DESIGN.md §6, Tooltip). */
export function RelativeTime({ iso, size = "sm" }: { iso: string; size?: "xs" | "sm" | "base" }) {
  const { locale } = useI18n();
  const now = useNow();
  return (
    <Tooltip content={absoluteTime(iso, locale)} className="shrink-0 whitespace-nowrap">
      <Text variant="secondary" size={size} as="span">
        <time dateTime={iso}>{relativeTime(iso, locale, now)}</time>
      </Text>
    </Tooltip>
  );
}
