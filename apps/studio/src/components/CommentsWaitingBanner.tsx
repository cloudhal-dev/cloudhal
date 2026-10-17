import { Banner } from "@cloudhal/ui";
import { ArrowRight, ChatsCircle } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { pendingCommentsCount } from "../lib/comments.ts";
import { useNotifications } from "./useNotifications.ts";

/**
 * "12 comments are waiting" on the site overview (RFC-0007 §14) while reader comments wait for a
 * person, from the bell's `comments-pending` digest (an Author's own articles only). Nothing when
 * none wait or the deployment has no comments.
 */
export function CommentsWaitingBanner({ siteId }: { siteId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const count = pendingCommentsCount(notifications.data?.items, siteId);
  if (count === 0) return null;
  return (
    <div role="status" data-testid="comments-waiting-banner">
      <Banner
        variant="alert"
        icon={<ChatsCircle weight="fill" />}
        title={t("overview.commentsWaiting", { count })}
        description={t("overview.commentsWaitingDescription")}
        action={
          <Banner.Action
            variant="secondary"
            icon={<ArrowRight />}
            onClick={() => navigate({ to: "/sites/$siteId/comments", params: { siteId } })}
          >
            {t("notifications.comments.review")}
          </Banner.Action>
        }
      />
    </div>
  );
}
