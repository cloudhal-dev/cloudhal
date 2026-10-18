import { Checkbox, Radio, Select, Text } from "@cloudhal/ui";
import { useQuery } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { api, type Role, type SiteRoles } from "../lib/api.ts";
import { rank } from "../lib/roles.ts";

/** Roles that can be limited to sites (RFC-0034 A2); Owners and Administrators cover every site. */
export const SITE_ROLES: readonly Role[] = ["editor", "author", "contributor"];

export function isSiteRole(role: Role): boolean {
  return SITE_ROLES.includes(role);
}

/** The installation's sites, shared with the site switcher (`["sites"]`). */
export function useSites() {
  return useQuery({ queryKey: ["sites"], queryFn: api.sites.list, staleTime: 60_000 });
}

/** Keeps the assignments within `role`: no site role above it. */
export function capSites(sites: SiteRoles, role: Role): SiteRoles {
  return Object.fromEntries(
    Object.entries(sites).map(([id, r]) => [id, r && rank(r) > rank(role) ? role : r]),
  );
}

/**
 * Which sites a member works on (RFC-0034 A2): every site, or only some, each with its role (never
 * above the member's role). Hidden on single-site installations; for Administrators it only says
 * that they work on every site. `value` undefined means every site.
 */
export function SiteAccessField({
  role,
  value,
  onChange,
  error,
}: {
  role: Role;
  value: SiteRoles | undefined;
  onChange: (next: SiteRoles | undefined) => void;
  error?: string | undefined;
}) {
  const t = useT();
  const sites = useSites().data ?? [];
  if (sites.length < 2) return null;
  if (!isSiteRole(role))
    return (
      <Text variant="secondary" size="sm">
        {t("siteAccess.everySite")}
      </Text>
    );
  const roles = SITE_ROLES.filter((r) => rank(r) <= rank(role));
  const items = Object.fromEntries(roles.map((r) => [r, t(`roles.names.${r}`)]));
  const toggle = (siteId: string, on: boolean) => {
    const next = { ...(value ?? {}) };
    if (on) next[siteId] = role;
    else delete next[siteId];
    onChange(next);
  };
  return (
    <div className="grid gap-3" data-testid="site-access">
      <Radio.Group
        value={value === undefined ? "all" : "some"}
        onValueChange={(v) => onChange(v === "all" ? undefined : {})}
      >
        <Radio.Legend>{t("siteAccess.legend")}</Radio.Legend>
        <Radio.Item value="all" label={t("siteAccess.all")} />
        <Radio.Item value="some" label={t("siteAccess.some")} />
      </Radio.Group>
      {value !== undefined && (
        <div className="grid gap-2 ps-6">
          {sites.map((site) => {
            const siteRole = value[site.id];
            return (
              <div key={site.id} className="flex min-h-9 items-center justify-between gap-3">
                <Checkbox
                  label={site.name}
                  checked={siteRole !== undefined}
                  onCheckedChange={(on) => toggle(site.id, on === true)}
                />
                {siteRole && (
                  <Select
                    size="sm"
                    aria-label={t("siteAccess.roleOn", { site: site.name })}
                    value={siteRole}
                    onValueChange={(v) => onChange({ ...value, [site.id]: v as Role })}
                    items={items}
                  />
                )}
              </div>
            );
          })}
          {error && (
            <Text variant="error" size="sm">
              {error}
            </Text>
          )}
        </div>
      )}
    </div>
  );
}

/** "Pick at least one site" when "only some" has none. */
export function siteAccessError(value: SiteRoles | undefined): boolean {
  return value !== undefined && Object.keys(value).length === 0;
}
