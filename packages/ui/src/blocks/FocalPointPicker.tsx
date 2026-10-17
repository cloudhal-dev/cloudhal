import { Button, cn, Text } from "@cloudflare/kumo";
import { Crosshair, X } from "@phosphor-icons/react";
import { type KeyboardEvent, type PointerEvent, useId, useRef } from "react";

export interface FocalPoint {
  /** 0 (left) to 1 (right). */
  x: number;
  /** 0 (top) to 1 (bottom). */
  y: number;
}

export interface FocalPointPickerLabels {
  /** The area's accessible name ("Focal point"). */
  title: string;
  /** How to use it, under the picture ("Click the subject, or use the arrow keys"). */
  hint: string;
  /** Where it is now, spoken and shown ("Left 30%, top 40%"); `undefined` → `unset`. */
  position: (p: FocalPoint) => string;
  /** No point set yet ("Centre: crops keep the middle"). */
  unset: string;
  /** The button that removes it ("Clear focal point"). */
  clear: string;
  /** The crop previews' caption ("How crops look"). */
  previews: string;
}

export interface FocalPointPickerProps {
  src: string;
  /** The picture's own size, for the frame's ratio. */
  width: number;
  height: number;
  value: FocalPoint | null;
  onChange: (value: FocalPoint | null) => void;
  labels: FocalPointPickerLabels;
  disabled?: boolean;
  className?: string;
  "data-testid"?: string;
}

const STEP = 0.05;
const clamp = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
const pct = (v: number) => `${Math.round(v * 1000) / 10}%`;

/**
 * Where an image's subject is (RFC-0028 §1): cover crops of the picture keep this point in view.
 * Click or tap the subject, or move the point with the arrow keys (Shift for bigger steps, Home
 * for the centre). Three crop previews (wide, square, tall) show what each frame keeps. Kumo has
 * no point picker, so it lives here.
 */
export function FocalPointPicker({
  src,
  width,
  height,
  value,
  onChange,
  labels,
  disabled = false,
  className,
  "data-testid": testId,
}: FocalPointPickerProps) {
  const area = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const point = value ?? { x: 0.5, y: 0.5 };
  // Key repeats can arrive before the parent re-renders: steps build on the last point sent.
  const latest = useRef(point);
  latest.current = point;
  const send = (next: FocalPoint) => {
    latest.current = next;
    onChange(next);
  };
  const spoken = value ? labels.position(value) : labels.unset;

  const pick = (e: PointerEvent<HTMLDivElement>) => {
    if (disabled || !area.current) return;
    const r = area.current.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return;
    send({
      x: clamp((e.clientX - r.left) / r.width),
      y: clamp((e.clientY - r.top) / r.height),
    });
  };

  const keys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (disabled) return;
    const step = e.shiftKey ? STEP * 4 : STEP;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    if (e.key === "Home") {
      e.preventDefault();
      send({ x: 0.5, y: 0.5 });
      return;
    }
    const d = move[e.key];
    if (!d) return;
    e.preventDefault();
    const from = latest.current;
    send({ x: clamp(from.x + d[0]), y: clamp(from.y + d[1]) });
  };

  return (
    <div className={cn("grid gap-4", className)} data-testid={testId}>
      <div className="grid gap-1.5">
        <div
          ref={area}
          // A two-axis picker, announced like a colour picker's area: a slider whose value text
          // names both coordinates.
          role="slider"
          tabIndex={disabled ? -1 : 0}
          aria-label={labels.title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(point.x * 100)}
          aria-valuetext={spoken}
          aria-describedby={hintId}
          aria-disabled={disabled || undefined}
          onPointerDown={pick}
          onKeyDown={keys}
          className={cn(
            "relative mx-auto w-fit max-w-full touch-none overflow-hidden rounded-lg outline-none ring ring-kumo-line focus-visible:ring-2 focus-visible:ring-kumo-focus",
            disabled ? "cursor-not-allowed" : "cursor-crosshair",
          )}
        >
          <img
            src={src}
            alt=""
            referrerPolicy="no-referrer"
            width={width}
            height={height}
            draggable={false}
            className="block max-h-96 w-auto max-w-full select-none"
          />
          {value && (
            <span
              aria-hidden
              className="pointer-events-none absolute flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-kumo-base/80 text-kumo-default shadow-md ring ring-kumo-line"
              style={{ left: pct(point.x), top: pct(point.y) }}
            >
              <Crosshair size={16} weight="bold" />
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Text variant="secondary" size="sm">
            <span id={hintId}>{labels.hint}</span> · <span aria-live="polite">{spoken}</span>
          </Text>
          <Button
            variant="ghost"
            size="sm"
            icon={<X size={16} />}
            disabled={disabled || !value}
            onClick={() => onChange(null)}
          >
            {labels.clear}
          </Button>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Text variant="secondary" size="sm">
          {labels.previews}
        </Text>
        <div className="flex items-end gap-3" aria-hidden>
          {(["16 / 9", "1 / 1", "3 / 4"] as const).map((ratio) => (
            <img
              key={ratio}
              src={src}
              alt=""
              referrerPolicy="no-referrer"
              className="h-20 w-auto rounded-md object-cover ring ring-kumo-line"
              style={{ aspectRatio: ratio, objectPosition: `${pct(point.x)} ${pct(point.y)}` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
