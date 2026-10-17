import { Badge, Button, Tooltip } from "@cloudhal/ui";
import { ChartLine } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { missesAnalytics } from "../lib/analytics-settings.ts";
import { type AgentKeySummary, api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { roleCan } from "../lib/roles.ts";
import { useToast } from "./Toast.ts";
import { useGate, useRoleRules } from "./useMe.ts";

/**
 * Who may allow analytics on a key: for one's own keys, the person's own `analytics.read`; for
 * someone else's (Administrators, `agents.manage`), whether the key's creator can read analytics —
 * keys stay narrowed to their creator's role (RFC-0005 I5), so a Contributor's key cannot hold it.
 */
function useKeyAccess(agentKey: AgentKeySummary, others: boolean) {
  const t = useT("analyticsSettings");
  const own = useGate("analytics.read");
  const rules = useRoleRules();
  if (!others) return own;
  const role = agentKey.owner?.role;
  const allowed = !role || roleCan(rules, role, "analytics.read");
  return {
    allowed,
    reason: allowed
      ? undefined
      : t("analyticsSettings.keys.ownerCannot", {
          name: agentKey.owner?.name ?? t("agents.all.unknownOwner"),
        }),
  };
}

/**
 * "Allow analytics" (RFC-0006 §9.1, open question 4; DESIGN.md §2v): keys made before
 * `analytics:read` existed lack it, and keys are never widened on their own. A quiet "No analytics"
 * badge says so (the tooltip explains), next to a one-click action that adds only that read-only
 * scope — audited on the server, no confirmation, a toast. Nothing for keys that hold it or are
 * disabled.
 */
export function AllowAnalytics({
  agentKey,
  others = false,
}: {
  agentKey: AgentKeySummary;
  /** Someone else's key, in the Administrators' "All keys" view. */
  others?: boolean;
}) {
  const t = useT("analyticsSettings");
  const toast = useToast();
  const qc = useQueryClient();
  const access = useKeyAccess(agentKey, others);
  const allow = useMutation({
    mutationFn: () => api.agentKeys.allowAnalytics(agentKey.id),
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
      toast.success(
        t("analyticsSettings.keys.allowed"),
        t("analyticsSettings.keys.allowedDescription", {
          name: updated.name ?? agentKey.name ?? t("agents.unnamed"),
        }),
      );
    },
    onError: (error) => toast.error(t("analyticsSettings.keys.failed"), apiErrorText(t, error)),
  });
  if (!agentKey.enabled || !missesAnalytics(agentKey)) return null;
  return (
    <div className="flex flex-wrap items-center gap-2" data-analytics-access="missing">
      <span className="inline-flex">
        <Tooltip
          content={
            <span className="block max-w-72">{t("analyticsSettings.keys.missingHint")}</span>
          }
        >
          <Badge variant="outline">{t("analyticsSettings.keys.missing")}</Badge>
        </Tooltip>
      </span>
      <Button
        variant="secondary"
        size="xs"
        icon={<ChartLine />}
        loading={allow.isPending}
        onClick={() => allow.mutate()}
        disabled={!access.allowed}
        title={access.reason}
      >
        {t("analyticsSettings.keys.allow")}
      </Button>
    </div>
  );
}
