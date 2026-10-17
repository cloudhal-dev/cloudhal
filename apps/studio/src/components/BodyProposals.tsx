import {
  ActorBadge,
  Badge,
  BodyDiff,
  Button,
  Checkbox,
  InsetPanel,
  SkeletonLine,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { type TFunction, useT } from "../i18n/index.tsx";
import { api, type ProposalItem, type ProposalStep } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { useBodyDiffLabels } from "./BodyChanges.tsx";
import { RelativeTime } from "./RelativeTime.tsx";
import { useToast } from "./Toast.ts";

/**
 * Agents' suggestions for a body (RFC-0014 §5, DESIGN.md §2y): each open proposal as the change it
 * would make now (`BodyDiff`), with Accept and Reject. Accepting writes the body at once, so it
 * waits while the form has unsaved changes; a suggestion whose blocks changed since is out of date
 * and can only be rejected. A suggestion of several operations lists them with checkboxes: the
 * diff follows the choice (`POST …/preview`) and Accept applies only the chosen ones.
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
    mutationFn: ({ id, accept, ops }: { id: string; accept: boolean; ops?: number[] }) =>
      accept ? api.proposals.accept(siteId, id, ops) : api.proposals.reject(siteId, id),
    onSuccess: (_r, { accept }) => {
      toast.success(accept ? t("proposals.accepted") : t("proposals.rejected"));
      if (accept) onDecided();
    },
    onError: (e) => {
      toast.error(t("proposals.failed"), apiErrorText(t, e));
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
          siteId={siteId}
          onDecide={(accept, ops) =>
            decide.mutate({ id: item.proposal.id, accept, ...(ops ? { ops } : {}) })
          }
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
  siteId,
  onDecide,
}: {
  item: ProposalItem;
  dirty: boolean;
  readOnly: boolean;
  busy: boolean;
  labels: ReturnType<typeof useBodyDiffLabels>;
  siteId: string;
  /** `ops`: the chosen operations, when not all of them. */
  onDecide: (accept: boolean, ops?: number[]) => void;
}) {
  const t = useT();
  const { proposal, problem } = item;
  const total = proposal.ops.length;
  const [chosen, setChosen] = useState<readonly number[]>(() => proposal.ops.map((_, i) => i));
  const some = chosen.length < total;
  // Only some operations: what those alone would change now.
  const partial = useQuery({
    queryKey: ["proposal-preview", siteId, proposal.id, chosen],
    queryFn: () => api.proposals.preview(siteId, proposal.id, [...chosen]),
    enabled: some && chosen.length > 0 && problem === undefined,
  });
  const diff = some ? partial.data?.diff : item.diff;
  const who = proposal.actor.name ?? proposal.actor.id;
  const pickable = !readOnly && problem === undefined && total > 1 && item.steps !== undefined;
  const blocked =
    dirty || problem !== undefined || chosen.length === 0 || (some && !partial.data?.diff);
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
          {pickable && (
            <Checkbox.Group
              legend={t("proposals.steps")}
              value={chosen.map(String)}
              allValues={proposal.ops.map((_, i) => String(i))}
              disabled={busy}
              onValueChange={(v: string[]) => setChosen(v.map(Number).sort((a, b) => a - b))}
            >
              {(item.steps ?? []).map((step, i) => (
                <Checkbox.Item key={i} value={String(i)} label={stepText(t, step)} />
              ))}
            </Checkbox.Group>
          )}
          {problem !== undefined ? (
            <Text variant="secondary" size="sm">
              {t("proposals.outOfDateHint")}
            </Text>
          ) : chosen.length === 0 ? (
            <Text variant="secondary" size="sm">
              {t("proposals.chooseRequired")}
            </Text>
          ) : diff ? (
            <BodyDiff diff={diff} labels={labels} />
          ) : some && partial.data?.problem ? (
            <Text variant="secondary" size="sm">
              {partial.data.problem}
            </Text>
          ) : (
            <SkeletonLine minWidth={40} maxWidth={80} />
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
                onClick={() => onDecide(true, some ? [...chosen] : undefined)}
              >
                {some
                  ? t("proposals.acceptSome", { count: chosen.length, total })
                  : t("proposals.accept")}
              </Button>
            </div>
          )}
        </div>
      </InsetPanel>
    </div>
  );
}

/** At most 80 characters: the diff below shows the whole change. */
const short = (text: string) => (text.length > 80 ? `${text.slice(0, 79).trimEnd()}…` : text);

/** One operation in words (the agent's text stays plain text). */
function stepText(t: TFunction, step: ProposalStep): string {
  const aBlock = t("proposals.aBlock");
  return t(`proposals.step.${step.op}`, {
    before: short(step.before ?? aBlock),
    after: short(step.after ?? aBlock),
  });
}
