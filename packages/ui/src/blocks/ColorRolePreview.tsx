import { cn, Text } from "@cloudflare/kumo";
import { InsetPanel } from "./InsetPanel.tsx";

export interface ColorRolePreviewScheme {
  id: string;
  /** "Light", "Dark" — in the person's language. */
  label: string;
  /** Role → `#rrggbb` (RFC-0023 `--ch-color-<role>`). */
  roles: Readonly<Record<string, string>>;
}

export interface ColorRolePreviewLabels {
  /** Accessible name of the whole preview. */
  preview: string;
  /** The sample's words: a heading, a line of body text, a link, a button and an accent tag. */
  heading: string;
  body: string;
  link: string;
  button: string;
  accent: string;
  /** Heading over the contrast repair notes. */
  notes: string;
}

export interface ColorRolePreviewProps {
  schemes: readonly ColorRolePreviewScheme[];
  /** The roles to list, in order, with their names in the person's language. */
  roles: readonly { role: string; label: string }[];
  /** What the contrast repair changed, already worded for people. */
  notes?: readonly string[];
  labels: ColorRolePreviewLabels;
  className?: string;
}

/**
 * The color roles a theme derives from its tokens (RFC-0023 §5), per scheme: a small sample of a
 * page drawn in those colors, then a swatch for each role with its hex value, and the contrast
 * notes. The colors are site data, so they are inline styles; the frame is Kumo's.
 */
export function ColorRolePreview({
  schemes,
  roles,
  notes = [],
  labels,
  className,
}: ColorRolePreviewProps) {
  return (
    <section aria-label={labels.preview} className={cn("@container grid min-w-0 gap-3", className)}>
      <div className={cn("grid min-w-0 gap-3", schemes.length > 1 && "@2xl:grid-cols-2")}>
        {schemes.map((s) => {
          const c = (role: string) => s.roles[role];
          return (
            <InsetPanel key={s.id} label={s.label} className="grid gap-3">
              <Text as="span" bold>
                {s.label}
              </Text>
              <div
                aria-hidden="true"
                data-scheme-sample={s.id}
                className="grid gap-1.5 rounded-md px-4 py-3 ring ring-kumo-hairline"
                style={{ background: c("surface"), color: c("text") }}
              >
                <span className="text-base font-semibold">{labels.heading}</span>
                <span className="text-sm" style={{ color: c("text-muted") }}>
                  {labels.body}{" "}
                  <span className="underline" style={{ color: c("link") }}>
                    {labels.link}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2 pt-1">
                  <span
                    className="rounded-md px-3 py-1 text-sm font-medium"
                    style={{ background: c("brand"), color: c("on-brand") }}
                  >
                    {labels.button}
                  </span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={{ background: c("accent"), color: c("on-accent") }}
                  >
                    {labels.accent}
                  </span>
                  <span
                    className="rounded-md px-3 py-1 text-sm"
                    style={{
                      background: c("surface-muted"),
                      color: c("text"),
                      boxShadow: `inset 0 0 0 1px ${c("border")}`,
                    }}
                  >
                    {labels.link}
                  </span>
                </span>
              </div>
              <ul className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-2 p-0 @md:grid-cols-2">
                {roles.map(({ role, label }) => (
                  <li key={role} className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-4 shrink-0 rounded-sm ring ring-kumo-hairline"
                      style={{ background: c(role) }}
                    />
                    <Text as="span" size="sm">
                      {label}
                    </Text>
                    <Text as="span" size="sm" variant="secondary">
                      <span className="font-mono">{c(role)}</span>
                    </Text>
                  </li>
                ))}
              </ul>
            </InsetPanel>
          );
        })}
      </div>
      {notes.length > 0 && (
        <div className="grid gap-1.5">
          <Text as="span" size="sm" bold>
            {labels.notes}
          </Text>
          <ul className="m-0 grid list-disc gap-1 ps-5">
            {notes.map((n) => (
              <li key={n}>
                <Text as="span" size="sm" variant="secondary">
                  {n}
                </Text>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
