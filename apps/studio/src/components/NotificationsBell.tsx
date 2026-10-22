import { Badge, Button, NotificationBell, SectionEmpty, SkeletonLine } from "@cloudhal/ui";
import { BellSimple, GearSix } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { liveNotifications } from "../lib/notifications.ts";
import { useNotificationAlerts, useNotifications } from "./useNotifications.ts";
import { useNow } from "./useNow.ts";

/**
 * The panel's items load with the first bell that has something in it (`NotificationItems.tsx`),
 * fetched as soon as there is something, so the panel opens without waiting.
 */
const loadItems = () => import("./NotificationItems.tsx");
const NotificationList = lazy(() => loadItems().then((m) => ({ default: m.NotificationList })));

function ListLoading() {
  return (
    <div className="grid gap-2 px-4 py-3">
      <SkeletonLine minWidth={40} maxWidth={70} />
      <SkeletonLine minWidth={60} maxWidth={90} />
    </div>
  );
}

/**
 * The top bar's bell (DESIGN.md §1, §2n): a count of what needs the person — elevations about to
 * end, agents asking for one — and a panel to act on them right there. It also hosts the one-time
 * toasts and browser notifications, since it is mounted whenever someone is signed in.
 */
export function NotificationsBell() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifications = useNotifications();
  useNotificationAlerts(notifications.data);
  // "8 min left" ages between polls; ended items drop out before the server confirms it.
  const now = useNow(15_000);
  const items = liveNotifications(notifications.data?.items, now);
  const close = () => setOpen(false);
  const waiting = items.length > 0;
  useEffect(() => {
    if (waiting) void loadItems();
  }, [waiting]);
  return (
    <NotificationBell
      label={
        items.length > 0
          ? t("notifications.bellCount", { count: items.length })
          : t("notifications.title")
      }
      count={items.length}
      title={t("notifications.title")}
      open={open}
      onOpenChange={setOpen}
      headerActions={
        items.length > 0 ? <Badge variant="secondary">{items.length}</Badge> : undefined
      }
      footer={
        <Button
          variant="ghost"
          size="sm"
          icon={<GearSix />}
          onClick={() => {
            close();
            void navigate({ to: "/account", hash: "notifications" });
          }}
        >
          {t("notifications.settings")}
        </Button>
      }
    >
      {items.length === 0 ? (
        <SectionEmpty
          icon={<BellSimple size={32} className="text-kumo-inactive" />}
          title={t("notifications.empty")}
          description={t("notifications.emptyDescription")}
        />
      ) : (
        <Suspense fallback={<ListLoading />}>
          <NotificationList items={items} now={now} onNavigate={close} />
        </Suspense>
      )}
    </NotificationBell>
  );
}
