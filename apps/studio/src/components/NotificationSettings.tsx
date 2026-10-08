import { Badge, Banner, Button, Switch, Text } from "@cloudhal/ui";
import { BellRinging, Info, ProhibitInset } from "@phosphor-icons/react";
import { useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  type BrowserPermission,
  browserPermission,
  readBrowserPreference,
  writeBrowserPreference,
} from "../lib/notifications.ts";
import { SettingRow, SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { raiseBrowserNotification } from "./useNotifications.ts";

const PERMISSION_BADGE: Record<NotificationPermission, "success" | "neutral" | "error"> = {
  granted: "success",
  default: "neutral",
  denied: "error",
};

/** A muted line with an info icon aligned to its first line (kumo-design icon-alignment). */
function MutedNote({ children }: { children: string }) {
  return (
    <div className="flex items-start gap-2" data-testid="notifications-note">
      <span className="flex h-lh items-center text-kumo-subtle">
        <Info size={16} />
      </span>
      <Text variant="secondary" size="sm">
        {children}
      </Text>
    </div>
  );
}

/**
 * Account › Notifications (DESIGN.md §2j, §2n): the bell always lists what needs the person; this
 * opt-in adds system notifications while Studio sits in a background tab. Turning it on asks the
 * browser for permission from the click itself (browsers ignore requests without a gesture). The
 * choice is remembered per browser. Denied: how to re-enable it. Unsupported: no switch, a note.
 */
export function NotificationSettings() {
  const t = useT();
  const toast = useToast();
  const [permission, setPermission] = useState<BrowserPermission>(browserPermission);
  const [enabled, setEnabled] = useState(readBrowserPreference);
  const [asking, setAsking] = useState(false);
  const on = enabled && permission === "granted";

  const toggle = async (checked: boolean) => {
    if (!checked) {
      writeBrowserPreference(false);
      setEnabled(false);
      return;
    }
    if (permission === "granted") {
      writeBrowserPreference(true);
      setEnabled(true);
      return;
    }
    setAsking(true);
    try {
      // Called synchronously from the switch's click, so the browser shows its prompt.
      const answer = await window.Notification.requestPermission();
      setPermission(answer);
      writeBrowserPreference(answer === "granted");
      setEnabled(answer === "granted");
      if (answer === "granted") toast.success(t("account.notifications.enabled"));
    } catch {
      setPermission(browserPermission());
    } finally {
      setAsking(false);
    }
  };

  return (
    <SettingsSection
      id="notifications"
      title={t("account.sections.notifications")}
      description={t("account.notifications.description")}
    >
      {permission === "unsupported" ? (
        <MutedNote>{t("account.notifications.unsupported")}</MutedNote>
      ) : (
        <>
          <div className="grid gap-1.5" data-browser-notifications={on ? "on" : "off"}>
            <Switch
              label={t("account.notifications.switch")}
              checked={on}
              disabled={permission === "denied" || asking}
              onCheckedChange={(checked) => void toggle(checked)}
            />
            <Text variant="secondary" size="sm">
              {t("account.notifications.switchHint")}
            </Text>
          </div>
          <dl className="-my-3" data-permission={permission}>
            <SettingRow
              label={t("account.notifications.permission")}
              hint={t(`account.notifications.permissionHints.${permission}`)}
            >
              <Badge variant={PERMISSION_BADGE[permission]} appearance="dot">
                {t(`account.notifications.permissions.${permission}`)}
              </Badge>
            </SettingRow>
          </dl>
          {permission === "denied" && (
            <Banner
              variant="secondary"
              icon={<ProhibitInset weight="fill" />}
              title={t("account.notifications.deniedTitle")}
              description={t("account.notifications.denied")}
            />
          )}
          {on && (
            <div>
              <Button
                variant="secondary"
                size="sm"
                icon={<BellRinging />}
                onClick={() =>
                  raiseBrowserNotification(
                    "cloudhal-test",
                    t("account.notifications.testTitle"),
                    t("account.notifications.testBody"),
                    () => undefined,
                  )
                }
              >
                {t("account.notifications.test")}
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsSection>
  );
}
