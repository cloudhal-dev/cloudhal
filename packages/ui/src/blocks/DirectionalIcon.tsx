import { useDirection } from "@cloudflare/kumo/primitives/direction-provider";
import { ArrowRight, type Icon, type IconProps } from "@phosphor-icons/react";
import { forwardRef } from "react";

export interface DirectionalIconProps extends Omit<IconProps, "mirrored"> {
  /** The Phosphor icon, as a component: `icon={ArrowRight}`. */
  icon: Icon;
}

/**
 * An icon that means a direction in reading order, mirrored in right-to-left languages with
 * Phosphor's `mirrored` (ADR-0033 C1): back and forward, previous and next, "from → to", a closed
 * tree row, opening a row or a page, reply, indent and outdent, opening elsewhere, signing in and
 * out, sending. Icons whose direction is physical or temporal stay as they are and are drawn
 * directly: clocks, refresh and undo circles, up and down, sort order, a chart's trend, media play,
 * checkmarks (Material's bidirectionality guidance).
 *
 * The direction comes from Base UI's `DirectionProvider` (Studio sets it from the locale registry),
 * so a block mirrors wherever it is rendered. Where a prop takes an icon component (Kumo's
 * `icon={ArrowRight}`, a table of icons), pass `directional(ArrowRight)`. The `rtl-icon` lint rule
 * asks for one of the two wherever such an icon is used directly.
 */
export function DirectionalIcon({ icon: Glyph, ...props }: DirectionalIconProps) {
  const rtl = useDirection() === "rtl";
  return <Glyph {...props} mirrored={rtl} />;
}

const components = new WeakMap<Icon, Icon>();

/** `glyph` as an icon component that mirrors in right-to-left languages; the same one each call. */
export function directional(glyph: Icon): Icon {
  let component = components.get(glyph);
  if (!component) {
    component = forwardRef<SVGSVGElement, IconProps>(({ mirrored: _, ...props }, ref) => (
      <DirectionalIcon {...props} ref={ref} icon={glyph} />
    ));
    component.displayName = `directional(${glyph.displayName ?? "icon"})`;
    components.set(glyph, component);
  }
  return component;
}

export interface TransitionArrowProps {
  /** Pixel size, matching the text beside it: 12 in table rows, 14–16 in dialogs. */
  size?: number;
}

/**
 * The muted arrow between a value before and after ("Editor → Admin", "/old → /new", a date moved),
 * pointing along the reading order in every language. Decorative: the words around it carry the
 * meaning.
 */
export function TransitionArrow({ size = 14 }: TransitionArrowProps) {
  return (
    <DirectionalIcon
      icon={ArrowRight}
      size={size}
      aria-hidden
      className="shrink-0 text-kumo-subtle"
    />
  );
}
