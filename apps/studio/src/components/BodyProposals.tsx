import { ActorBadge, Badge, BodyDiff, Button, InsetPanel, Text, Tooltip } from "@cloudhal/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useT } from "../i18n/index.tsx";
import { api, type ProposalItem } from "../lib/api.ts";
import { useBodyDiffLabels } from "./BodyChanges.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { useToast } from "./Toast.ts";

/**
 * Agents' suggestions for a body (RFC-0014 §5, DESIGN.md §2y): each open proposal as the change it
 * would make now (`BodyDiff`), with Accept and Reject. Accepting writes the body at once, so it
 * waits while the form has unsaved changes; a suggestion whose blocks changed since is out of date
 * and can only be rejected.
 */
export function BodyProposals({
  siteId,
  nodeId,
  sectionId,
  dirty,
  readOnly = false,
  onDecided,
}: {
  siteId: string;
  /** The article, or the page whose rich-text section `sectionId` is shown. */
  nodeId: string;
  sectionId?: string;
  /** The form has unsaved changes: accepting would overwrite them. */
  dirty: boolean;
  readOnly?: boolean;
  /** After an accept: reload the article or page. */
  onDecided: () => void;
}) {
  const t = useT();
  const toast = useToast();
  const labels = useBodyDiffLabels();
  const queryClient = useQueryClient();
  const key = ["proposals", siteId, nodeId];
  const list = useQuery({ queryKey: key, queryFn: () => api.proposals.list(siteId, nodeId) });
  const decide = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      accept ? api.proposals.accept(siteId, id) : api.proposals.reject(siteId, id),
    onSuccess: (_r, { accept }) => {
      toast.success(accept ? t("proposals.accepted") : t("proposals.rejected"));
      if (accept) onDecided();
    },
    onError: (e) => {
      toast.error(t("proposals.failed"), e instanceof Error ? e.message : String(e));
      onDecided();
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: key }),
  });
  const items = (list.data ?? []).filter((i) => i.proposal.sectionId === sectionId);
  if (items.length === 0) return null;
  return (
    <div className="grid min-w-0 gap-2" data-proposals="">
      <div className="flex items-center gap-2">
        <Text bold as="h3" size="sm">
          {t("proposals.title")}
        </Text>
        <Badge variant="info">{t("proposals.count", { count: items.length })}</Badge>
      </div>
      {items.map((item) => (
        <Proposal
          key={item.proposal.id}
          item={item}
          dirty={dirty}
          readOnly={readOnly}
          busy={decide.isPending && decide.variables?.id === item.proposal.id}
          labels={labels}
          onDecide={(accept) => decide.mutate({ id: item.proposal.id, accept })}
        />
      ))}
    </div>
  );
}

function Proposal({
  item,
  dirty,
  readOnly,
  busy,
  labels,
  onDecide,
}: {
  item: ProposalItem;
  dirty: boolean;
  readOnly: boolean;
  busy: boolean;
  labels: ReturnType<typeof useBodyDiffLabels>;
  onDecide: (accept: boolean) => void;
}) {
  const t = useT();
  const { proposal, diff, problem } = item;
  const who = proposal.actor.name ?? proposal.actor.id;
  const blocked = dirty || problem !== undefined;
  return (
    <div data-proposal={proposal.id}>
      <InsetPanel>
        <div className="grid min-w-0 gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <ActorBadge kind={proposal.actor.kind} label={t("proposals.from", { name: who })} />
            <RelativeTime iso={proposal.createdAt} />
            {problem !== undefined && (
              <Tooltip content={problem}>
                <span className="inline-flex">
                  <Badge variant="warning">{t("proposals.outOfDate")}</Badge>
                </span>
              </Tooltip>
            )}
          </div>
          {proposal.note && <Text size="sm">{proposal.note}</Text>}
          {diff ? (
            <BodyDiff diff={diff} labels={labels} />
          ) : (
            <Text variant="secondary" size="sm">
              {t("proposals.outOfDateHint")}
            </Text>
          )}
          {!readOnly && (
            <div className="flex flex-wrap items-center justify-end gap-2">
              {dirty && (
                <Text variant="secondary" size="sm">
                  {t("proposals.saveFirst")}
                </Text>
              )}
              <Button variant="secondary" size="sm" disabled={busy} onClick={() => onDecide(false)}>
                {t("proposals.reject")}
              </Button>
              <Button
                variant="primary"
                size="sm"
                disabled={blocked}
                loading={busy}
                onClick={() => onDecide(true)}
              >
                {t("proposals.accept")}
              </Button>
            </div>
          )}
        </div>
      </InsetPanel>
    </div>
  );
}
