import { Sidebar, SidebarSwitcher } from "@cloudhal/ui";
import { Gear, SquaresFour } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "../components/AppFrame.tsx";
import { useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";

/** Account surface: everything above a single site (DESIGN.md §1). */
export function AccountShell() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  return (
    <AppFrame
      title={t("app.name")}
      loading={sites.isPending}
      switcher={
        <SidebarSwitcher
          ariaLabel={t("nav.switchSite")}
          current={{ id: "account", name: t("app.name"), icon: SquaresFour }}
          items={[
            { id: "account", name: t("app.name"), icon: SquaresFour },
            ...(sites.data ?? []).map((s) => ({ id: s.id, name: s.name })),
          ]}
          onSelect={(item) =>
            item.id !== "account" && navigate({ to: "/sites/$siteId", params: { siteId: item.id } })
          }
        />
      }
      nav={
        <>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.overview")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton
                icon={SquaresFour}
                href="/sites"
                active={pathname === "/sites"}
                tooltip={t("nav.sites")}
              >
                {t("nav.sites")}
                <Sidebar.MenuBadge>{sites.data?.length ?? 0}</Sidebar.MenuBadge>
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.account")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={Gear} tooltip={t("nav.soon")} disabled>
                {t("nav.account")}
                <Sidebar.MenuBadge>{t("nav.soon")}</Sidebar.MenuBadge>
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
        </>
      }
      commands={[{ id: "sites", label: t("nav.allSites"), run: () => navigate({ to: "/sites" }) }]}
    >
      <Outlet />
    </AppFrame>
  );
}
