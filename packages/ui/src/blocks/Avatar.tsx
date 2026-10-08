import { cn, Text } from "@cloudflare/kumo";

export type AvatarSize = "sm" | "base" | "lg";

export interface AvatarProps {
  /** One or two letters (the caller computes them, e.g. from the person's name). */
  initials: string;
  /** `sm` 24 px (dense cells, menus), `base` 32 px (table rows), `lg` 48 px (profile headers). */
  size?: AvatarSize;
  className?: string;
}

const SIZE: Record<AvatarSize, string> = {
  sm: "size-6",
  base: "size-8",
  lg: "size-12",
};

/**
 * A person's initials in a round tinted tile — the only avatar in Studio (no uploaded images or
 * third-party services). Decorative: the name is always written next to it, so it is hidden from
 * assistive technology.
 */
export function Avatar({ initials, size = "base", className }: AvatarProps) {
  return (
    <span
      aria-hidden
      data-avatar
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-kumo-tint ring ring-kumo-line",
        SIZE[size],
        className,
      )}
    >
      <Text bold as="span" size={size === "lg" ? "base" : "xs"}>
        {initials}
      </Text>
    </span>
  );
}
