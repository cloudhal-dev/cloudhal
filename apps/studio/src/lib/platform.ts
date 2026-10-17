/** The person's platform, for keyboard hints (DESIGN.md §1 "Top bar"). */

/** True on Apple platforms, where the palette's shortcut is ⌘K rather than Ctrl+K. */
export function isApplePlatform(): boolean {
  if (typeof navigator === "undefined") return false;
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return /mac|iphone|ipad|ipod/i.test(nav.userAgentData?.platform ?? nav.platform ?? "");
}
