import { Avatar, Button, DropdownMenu, Text, Tooltip } from "@cloudhal/ui";
import { SignOut, SquaresFour, Translate, UserGear, UsersThree } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { LOCALE_LIST, type Locale, useI18n } from "../i18n/index.tsx";
import { authClient } from "../lib/auth.ts";
import { initials } from "../lib/initials.ts";
import { useThemePreference } from "../lib/theme.ts";
import { languageNames } from "./LanguageSwitch.tsx";
import { RoleBadge } from "./Roles.tsx";
import { ThemeRadioItems, themeIcon } from "./ThemeSwitch.tsx";
import { useMe } from "./useMe.ts";

/**
 * The signed-in person's menu, at the right end of the top bar (DESIGN.md §1): an avatar button
 * like Kumo's account demos, so it is there whether the sidebar is expanded, collapsed or a
 * sheet. It names who is signed in and their staff role (RFC-0005 §10.3), leads to Account, Team
 * and All sites, carries Theme and Language (the top bar hides those on phones) and signs out.
 */
export function UserMenu() {
  const { t, locale, setLocale } = useI18n();
  const names = languageNames(t);
  const navigate = useNavigate();
  const [theme] = useThemePreference();
  const me = useMe();
  const name = me.data?.actor.name ?? t("nav.account");
  const role = me.data?.role ?? undefined;
  const signOut = async () => {
    await authClient.signOut();
    await navigate({ to: "/login" });
  };
  return (
    <DropdownMenu>
      <Tooltip
        content={name}
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="circle"
                aria-label={name}
                data-testid="user-menu"
              >
                <Avatar initials={initials(me.data?.actor.name)} size="sm" />
              </Button>
            }
          />
        }
      />
      <DropdownMenu.Content align="end" className="min-w-56">
        <div className="grid gap-1.5 px-2 py-1.5" data-testid="account-menu-role">
          <Text size="sm" bold truncate as="span">
            {name}
          </Text>
          {role && <RoleBadge value={role} />}
        </div>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={UserGear} onClick={() => navigate({ to: "/account" })}>
          {t("nav.account")}
        </DropdownMenu.Item>
        <DropdownMenu.Item icon={UsersThree} onClick={() => navigate({ to: "/team" })}>
          {t("nav.team")}
        </DropdownMenu.Item>
        <DropdownMenu.Item icon={SquaresFour} onClick={() => navigate({ to: "/sites" })}>
          {t("nav.allSites")}
        </DropdownMenu.Item>
        <DropdownMenu.Separator />
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger icon={themeIcon(theme)}>
            {t("theme.label")}
          </DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <ThemeRadioItems />
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Sub>
          <DropdownMenu.SubTrigger icon={Translate}>{t("common.language")}</DropdownMenu.SubTrigger>
          <DropdownMenu.SubContent>
            <DropdownMenu.RadioGroup value={locale} onValueChange={(v: Locale) => setLocale(v)}>
              {LOCALE_LIST.map((l) => (
                <DropdownMenu.RadioItem key={l} value={l}>
                  {names[l]}
                  <DropdownMenu.RadioItemIndicator />
                </DropdownMenu.RadioItem>
              ))}
            </DropdownMenu.RadioGroup>
          </DropdownMenu.SubContent>
        </DropdownMenu.Sub>
        <DropdownMenu.Separator />
        <DropdownMenu.Item icon={SignOut} onClick={signOut}>
          {t("common.signOut")}
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
