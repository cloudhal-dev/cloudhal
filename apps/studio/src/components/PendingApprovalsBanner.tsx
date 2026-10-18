import { Banner, DirectionalIcon } from "@cloudhal/ui";
import { ArrowRight, HandPalm } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { usePendingApprovals } from "./usePendingApprovals.ts";

/** Prominent alert on the site overview while agents wait for a decision (ADR-0014). */
export function PendingApprovalsBanner({ siteId }: { siteId: string }) {
  const t = useT();
  const navigate = useNavigate();
  const pending = usePendingApprovals(siteId);
  const count = pending.data?.length ?? 0;
  if (count === 0) return null;
  return (
    <div role="status" data-testid="pending-approvals-banner">
      <Banner
        variant="alert"
        icon={<HandPalm weight="fill" />}
        title={t("approvals.banner.title", { count })}
        description={t("approvals.banner.description")}
        action={
          <Banner.Action
            variant="primary"
            icon={<DirectionalIcon icon={ArrowRight} />}
            onClick={() => navigate({ to: "/sites/$siteId/approvals", params: { siteId } })}
          >
            {t("approvals.banner.action")}
          </Banner.Action>
        }
      />
    </div>
  );
}
