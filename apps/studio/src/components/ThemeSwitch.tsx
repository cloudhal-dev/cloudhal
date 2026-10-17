import { Button, DropdownMenu, Tooltip } from "@cloudhal/ui";
import { Desktop, type Icon, Moon, Sun } from "@phosphor-icons/react";
import { useT } from "../i18n/index.tsx";
import { THEME_PREFERENCES, type ThemePreference, useThemePreference } from "../lib/theme.ts";

/** Sun, moon, or a desktop for "follow the system". */
export function themeIcon(preference: ThemePreference): Icon {
  if (preference === "light") return Sun;
  if (preference === "system") return Desktop;
  return Moon;
}

/** The three choices as radio items, shared by the top bar menu and the user menu's submenu. */
export function ThemeRadioItems() {
  const t = useT();
  const [preference, setPreference] = useThemePreference();
  return (
    <DropdownMenu.RadioGroup
      value={preference}
      onValueChange={(v: ThemePreference) => setPreference(v)}
    >
      {THEME_PREFERENCES.map((p) => (
        <DropdownMenu.RadioItem key={p} value={p} icon={themeIcon(p)} closeOnClick>
          {t(`theme.${p}`)}
          <DropdownMenu.RadioItemIndicator />
        </DropdownMenu.RadioItem>
      ))}
    </DropdownMenu.RadioGroup>
  );
}

/**
 * Light, dark or the system's scheme (DESIGN.md §1 top bar). An icon-only ghost button like the
 * bell; its icon shows the current choice, the menu lists all three with a check on it.
 */
export function ThemeSwitch() {
  const t = useT();
  const [preference] = useThemePreference();
  const Current = themeIcon(preference);
  const label = t("theme.current", { name: t(`theme.${preference}`) });
  return (
    <DropdownMenu>
      <Tooltip
        content={label}
        render={
          <DropdownMenu.Trigger
            render={
              <Button
                variant="ghost"
                size="sm"
                shape="square"
                aria-label={label}
                icon={<Current size={16} />}
                data-theme-preference={preference}
              />
            }
          />
        }
      />
      <DropdownMenu.Content align="end" className="min-w-40">
        <ThemeRadioItems />
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
