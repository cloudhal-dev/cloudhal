import { Badge, Button, Tooltip } from "@cloudhal/ui";
import { ChatsCircle, Warning } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { type AgentKeySummary, api } from "../lib/api.ts";
import { missesComments } from "../lib/comment-settings.ts";
import { holds, roleCan } from "../lib/roles.ts";
import { useToast } from "./Toast.ts";
import { useGate, useRoleRules } from "./useMe.ts";

/**
 * Who may allow comments on a key: for one's own keys, the person's own `comments.read`; for
 * someone else's (Administrators), whether the key's creator can read comments — keys stay
 * narrowed to their creator's role (RFC-0005 I5), so a Contributor's key cannot hold it.
 */
function useKeyAccess(agentKey: AgentKeySummary, others: boolean) {
  const t = useT("commentsSettings");
  const own = useGate("comments.read");
  const rules = useRoleRules();
  if (!others) return own;
  const role = agentKey.owner?.role;
  const allowed = !role || roleCan(rules, role, "comments.read");
  return {
    allowed,
    reason: allowed
      ? undefined
      : t("commentsSettings.keys.ownerCannot", {
          name: agentKey.owner?.name ?? t("agents.all.unknownOwner"),
        }),
  };
}

/**
 * "Allow comments" (RFC-0007 §10.1; DESIGN.md §2w), the twin of "Allow analytics": keys made
 * before `comments:read` existed lack it and are never widened on their own. A quiet "No comments"
 * badge says so, next to a one-click action that adds only that read scope — audited on the
 * server. A key that reads comments and can also change content gets the §11.2 point 5 hint:
 * reader text reaches an agent that edits the site.
 */
export function AllowComments({
  agentKey,
  others = false,
}: {
  agentKey: AgentKeySummary;
  /** Someone else's key, in the Administrators' "All keys" view. */
  others?: boolean;
}) {
  const t = useT("commentsSettings");
  const toast = useToast();
  const qc = useQueryClient();
  const access = useKeyAccess(agentKey, others);
  // Only on deployments with reader comments.
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance, retry: false });
  const allow = useMutation({
    mutationFn: () => api.agentKeys.allowComments(agentKey.id),
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
      toast.success(
        t("commentsSettings.keys.allowed"),
        t("commentsSettings.keys.allowedDescription", {
          name: updated.name ?? agentKey.name ?? t("agents.unnamed"),
        }),
      );
    },
    onError: (error) => toast.error(t("commentsSettings.keys.failed"), error.message),
  });
  if (!agentKey.enabled || instance.data?.features.comments?.available !== true) return null;
  if (!missesComments(agentKey)) {
    const writes =
      holds(agentKey.scopes, "content:write:own") || holds(agentKey.scopes, "site:publish:own");
    if (!writes) return null;
    return (
      <span className="inline-flex" data-comment-access="writes">
        <Tooltip
          content={<span className="block max-w-72">{t("commentsSettings.keys.writeHint")}</span>}
        >
          <Badge variant="warning" icon={<Warning size={16} />}>
            {t("commentsSettings.keys.writeHintBadge")}
          </Badge>
        </Tooltip>
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2" data-comment-access="missing">
      <span className="inline-flex">
        <Tooltip
          content={<span className="block max-w-72">{t("commentsSettings.keys.missingHint")}</span>}
        >
          <Badge variant="outline">{t("commentsSettings.keys.missing")}</Badge>
        </Tooltip>
      </span>
      <Button
        variant="secondary"
        size="xs"
        icon={<ChatsCircle />}
        loading={allow.isPending}
        onClick={() => allow.mutate()}
        disabled={!access.allowed}
        title={access.reason}
      >
        {t("commentsSettings.keys.allow")}
      </Button>
    </div>
  );
}
