import { Sidebar, SidebarSwitcher } from "@cloudhal/ui";
import { Robot, SquaresFour, UserGear, UsersThree } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { AppFrame } from "../components/AppFrame.tsx";
import { PlaygroundUnavailable } from "../components/PlaygroundUnavailable.tsx";
import { useMembers } from "../components/useMe.ts";
import { isPlaygroundBlockedPath, usePlayground } from "../components/usePlayground.ts";
import { useT } from "../i18n/index.tsx";
import { api, isNotEnabled } from "../lib/api.ts";

/** Account surface: everything above a single site (DESIGN.md §1). */
export function AccountShell() {
  const t = useT();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // RFC-0036 §5: a playground has no people, agents or sign-in; their screens are not offered.
  const playground = usePlayground();
  const people = !playground;
  const sites = useQuery({ queryKey: ["sites"], queryFn: api.sites.list });
  const keys = useQuery({
    queryKey: ["agent-keys"],
    queryFn: api.agentKeys.list,
    retry: (count, error) => !isNotEnabled(error) && count < 1,
    enabled: people,
  });
  const skills = useQuery({ queryKey: ["skills"], queryFn: api.skills.list, enabled: people });
  const members = useMembers(people);
  const accountCommands = [
    { id: "agents", label: t("commands.goAgents"), run: () => navigate({ to: "/agents" }) },
    {
      id: "skills",
      label: t("commands.goSkills"),
      run: () => navigate({ to: "/agents/skills" }),
    },
    { id: "team", label: t("commands.goTeam"), run: () => navigate({ to: "/team" }) },
    {
      id: "account",
      label: t("commands.goAccount"),
      run: () => navigate({ to: "/account" }),
    },
  ];
  return (
    <AppFrame
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
          {people && (
            <Sidebar.Group>
              <Sidebar.GroupLabel>{t("nav.automation")}</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuItem>
                  <Sidebar.Collapsible defaultOpen>
                    <Sidebar.CollapsibleTrigger
                      render={
                        <Sidebar.MenuButton
                          icon={Robot}
                          tooltip={t("nav.agents")}
                          active={pathname.startsWith("/agents")}
                        >
                          {t("nav.agents")}
                          <Sidebar.MenuChevron />
                        </Sidebar.MenuButton>
                      }
                    />
                    <Sidebar.CollapsibleContent>
                      <Sidebar.MenuSub>
                        <Sidebar.MenuSubButton href="/agents" active={pathname === "/agents"}>
                          {t("nav.agentKeys")}
                          {keys.data && <Sidebar.MenuBadge>{keys.data.length}</Sidebar.MenuBadge>}
                        </Sidebar.MenuSubButton>
                        <Sidebar.MenuSubButton
                          href="/agents/skills"
                          active={pathname === "/agents/skills"}
                        >
                          {t("nav.agentSkills")}
                          {skills.data && (
                            <Sidebar.MenuBadge>{skills.data.length}</Sidebar.MenuBadge>
                          )}
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSub>
                    </Sidebar.CollapsibleContent>
                  </Sidebar.Collapsible>
                </Sidebar.MenuItem>
              </Sidebar.Menu>
            </Sidebar.Group>
          )}
          {people && (
            <Sidebar.Group>
              <Sidebar.GroupLabel>{t("nav.settings")}</Sidebar.GroupLabel>
              <Sidebar.Menu>
                <Sidebar.MenuButton
                  icon={UsersThree}
                  href="/team"
                  active={pathname === "/team"}
                  tooltip={t("nav.team")}
                >
                  {t("nav.team")}
                  {members.data && <Sidebar.MenuBadge>{members.data.length}</Sidebar.MenuBadge>}
                </Sidebar.MenuButton>
                <Sidebar.MenuButton
                  icon={UserGear}
                  href="/account"
                  active={pathname === "/account"}
                  tooltip={t("nav.account")}
                >
                  {t("nav.account")}
                </Sidebar.MenuButton>
              </Sidebar.Menu>
            </Sidebar.Group>
          )}
        </>
      }
      commands={[
        { id: "sites", label: t("nav.allSites"), run: () => navigate({ to: "/sites" }) },
        ...(people ? accountCommands : []),
      ]}
    >
      {playground && isPlaygroundBlockedPath(pathname) ? (
        <PlaygroundUnavailable deployUrl={playground.deployUrl} />
      ) : (
        <Outlet />
      )}
    </AppFrame>
  );
}
