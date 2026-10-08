import { Badge, Tabs } from "@cloudhal/ui";
import { useNavigate } from "@tanstack/react-router";
import { useT } from "../i18n/index.tsx";
import { usePendingApprovals } from "./usePendingApprovals.ts";

/**
 * Segmented switch at the top of site › Activity: the audit log and the approvals that wait for
 * a person (the MCP server points agents to "site → Activity → Approvals").
 */
export function ActivityViews({
  siteId,
  value,
}: {
  siteId: string;
  value: "activity" | "approvals";
}) {
  const t = useT();
  const navigate = useNavigate();
  const pending = usePendingApprovals(siteId);
  const count = pending.data?.length ?? 0;
  return (
    <Tabs
      variant="segmented"
      value={value}
      onValueChange={(v) =>
        navigate({
          to: v === "approvals" ? "/sites/$siteId/approvals" : "/sites/$siteId/activity",
          params: { siteId },
        })
      }
      tabs={[
        { value: "activity", label: t("approvals.views.activity") },
        {
          value: "approvals",
          label: (
            <span className="flex items-center gap-1.5">
              {t("approvals.views.approvals")}
              {count > 0 && (
                <span data-testid="approvals-tab-count">
                  <Badge variant="warning">{count}</Badge>
                </span>
              )}
            </span>
          ),
        },
      ]}
    />
  );
}
