import { Sidebar, Text } from "@cloudhal/ui";
import { Gear, SquaresFour } from "@phosphor-icons/react";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "../components/AppFrame.tsx";
import { useT } from "../i18n/index.tsx";

/** Account surface: everything above a single site (DESIGN.md §1). */
export function AccountShell() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  return (
    <AppFrame
      title={t("app.name")}
      switcher={
        <div className="flex items-center gap-2 px-2 py-1.5">
          <SquaresFour size={20} className="shrink-0 text-kumo-brand" />
          <Text bold truncate as="span">
            {t("app.name")}
          </Text>
        </div>
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
              </Sidebar.MenuButton>
            </Sidebar.Menu>
          </Sidebar.Group>
          <Sidebar.Group>
            <Sidebar.GroupLabel>{t("nav.account")}</Sidebar.GroupLabel>
            <Sidebar.Menu>
              <Sidebar.MenuButton icon={Gear} tooltip={t("nav.soon")}>
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
