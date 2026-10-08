import { Banner } from "@cloudhal/ui";
import { LockSimple } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "../i18n/index.tsx";

/**
 * Role gating (DESIGN.md §2s, RFC-0005 I16): a screen the person may read but not change says so
 * once, at the top, with the role that can — `Banner variant="secondary"` with a lock. Nothing when
 * `reason` is undefined (the person may change it).
 */
export function ViewOnlyBanner({ reason }: { reason: string | undefined }) {
  const t = useT();
  if (!reason) return null;
  return (
    <div data-testid="view-only">
      <Banner
        variant="secondary"
        icon={<LockSimple weight="fill" />}
        title={t("gating.readOnlyTitle")}
        description={reason}
      />
    </div>
  );
}

/**
 * Turns every control inside off at once (a disabled `<fieldset>`: inputs, Kumo buttons and menu
 * triggers), while links keep working — for tables and forms a role may read but not change. The
 * page's `ViewOnlyBanner` says why. `className` keeps the layout of the container it replaces.
 */
export function ReadOnly({
  reason,
  className,
  children,
}: {
  reason: string | undefined;
  className?: string;
  children: ReactNode;
}) {
  return (
    <fieldset
      disabled={reason !== undefined}
      data-read-only={reason ? "true" : undefined}
      className={className ?? "flex min-w-0 flex-col gap-4"}
    >
      {children}
    </fieldset>
  );
}
