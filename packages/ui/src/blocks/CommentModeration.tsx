import { Collapsible, Text } from "@cloudflare/kumo";
import type { Actor, ActorKind, CommentModeration } from "@cloudhal/core-contracts";
import { type ReactNode, useState } from "react";
import { ActorBadge } from "./AuditBadges.tsx";
import {
  type CommentModerationAction,
  type CommentReasonCode,
  formatCommentTime,
} from "./comment-model.ts";
import { InsetPanel } from "./InsetPanel.tsx";

/** A `comment_events` row as the thread view receives it (RFC-0007 §4.1): no comment text, no email. */
export interface CommentEvent {
  id: string;
  action: CommentModerationAction | "label" | "reply";
  actor: Actor;
  at: string;
  reasonCode?: CommentReasonCode;
  /** The moderator's note: plain text, at most 500 characters. */
  note?: string;
  automated: boolean;
  /** When a person approved an agent's request: the person's name (§10.3). */
  approvedBy?: string;
}

/** Words for moderation records, shared by `StatementOfReasons` and `CommentHistory`. */
export interface CommentModerationLabels {
  /** The decision in words: "Approved", "Hidden", "Marked as spam", "Held for review" … */
  action: Record<CommentEvent["action"], string>;
  /** What the decision does to the comment ("Removed from the public page"). DSA Art. 17(3)(a). */
  effect: Partial<Record<CommentModerationAction, string>>;
  /** The reason codes in words ("Abuse", "Personal data", "Legal order" …). */
  reason: Record<CommentReasonCode, string>;
  /** Actor kinds for the badge: Human, Agent, System. */
  actorKind: Record<ActorKind, string>;
  /** `(person, agent)` → "Approved by Ayşe for Comment triage". */
  approvedFor: (person: string, agent: string) => string;
}

export interface StatementOfReasonsLabels {
  /** "Statement of reasons". */
  title: string;
  decision: string;
  grounds: string;
  /** "Facts and circumstances". */
  facts: string;
  /** When the moderator wrote no note ("No note was given"). */
  noFacts: string;
  /** "Automated means". */
  automated: string;
  /** "Yes — decided without a person (an agent, a rule or a ban)". */
  automatedYes: string;
  /** "No — a person decided". */
  automatedNo: string;
  decidedBy: string;
  decidedAt: string;
  /** When the record has no reason code (an approval): "Not required for this decision". */
  noGrounds: string;
  /** Optional: how the commenter can contest it ("Reply to the notice, or contact the site owner"). */
  redress?: string;
  redressLabel?: string;
}

export interface StatementOfReasonsProps {
  moderation: CommentModeration;
  locale: string;
  labels: StatementOfReasonsLabels;
  words: CommentModerationLabels;
  /** The person who approved an agent's request, when that is how the decision came about. */
  approvedBy?: string;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-w-0 gap-0.5 @md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] @md:gap-4">
      <dt>
        <Text as="span" variant="secondary" size="sm">
          {label}
        </Text>
      </dt>
      <dd className="m-0 min-w-0">{children}</dd>
    </div>
  );
}

function ActorLine({
  actor,
  words,
  approvedBy,
}: {
  actor: Actor;
  words: CommentModerationLabels;
  approvedBy?: string | undefined;
}) {
  const name = actor.name ?? actor.id;
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
      <ActorBadge kind={actor.kind} label={words.actorKind[actor.kind]} />
      <span dir="auto" className="min-w-0 wrap-anywhere">
        <Text as="span">{name}</Text>
      </span>
      {approvedBy && (
        <Text as="span" variant="secondary" size="sm">
          {words.approvedFor(approvedBy, name)}
        </Text>
      )}
    </span>
  );
}

/**
 * The statement of reasons for a moderation decision (EU DSA Art. 17; RFC-0007 §4.1, §5.1): what
 * was decided and what it does, the grounds (the reason code in words), the facts (the
 * moderator's note, plain text), whether automated means decided, who decided — with "Approved by
 * Ayşe for Comment triage" when a person approved an agent's request — when, and optionally how to
 * contest it. A labelled `InsetPanel` with a `dl`; it goes in the thread view's details and the
 * commenter's export preview.
 */
export function StatementOfReasons({
  moderation,
  locale,
  labels,
  words,
  approvedBy,
}: StatementOfReasonsProps) {
  const at = formatCommentTime(moderation.at, locale).absolute;
  const effect = words.effect[moderation.action];
  return (
    <InsetPanel label={labels.title} className="@container">
      <Text as="span" bold>
        {labels.title}
      </Text>
      <dl className="m-0 grid gap-3" data-statement-of-reasons={moderation.action}>
        <Row label={labels.decision}>
          <span className="grid gap-0.5">
            <Text as="span">{words.action[moderation.action]}</Text>
            {effect && (
              <Text as="span" variant="secondary" size="sm">
                {effect}
              </Text>
            )}
          </span>
        </Row>
        <Row label={labels.grounds}>
          <Text as="span" variant={moderation.reasonCode ? "body" : "secondary"}>
            {moderation.reasonCode ? words.reason[moderation.reasonCode] : labels.noGrounds}
          </Text>
        </Row>
        <Row label={labels.facts}>
          {moderation.note ? (
            <span dir="auto" className="block min-w-0 whitespace-pre-line wrap-anywhere">
              <Text as="span">{moderation.note}</Text>
            </span>
          ) : (
            <Text as="span" variant="secondary">
              {labels.noFacts}
            </Text>
          )}
        </Row>
        <Row label={labels.automated}>
          <Text as="span">{moderation.automated ? labels.automatedYes : labels.automatedNo}</Text>
        </Row>
        <Row label={labels.decidedBy}>
          <ActorLine actor={moderation.actor} words={words} approvedBy={approvedBy} />
        </Row>
        <Row label={labels.decidedAt}>
          <time dateTime={moderation.at}>
            <Text as="span">{at}</Text>
          </time>
        </Row>
        {labels.redress && labels.redressLabel && (
          <Row label={labels.redressLabel}>
            <Text as="span">{labels.redress}</Text>
          </Row>
        )}
      </dl>
    </InsetPanel>
  );
}

export interface CommentHistoryLabels {
  /** The disclosure: `(n)` → "History (4)". */
  title: (count: number) => string;
  /** When there is nothing yet ("No moderation yet"). */
  empty: string;
}

export interface CommentHistoryProps {
  /** `comment_events` rows, any order (shown newest first). */
  events: readonly CommentEvent[];
  locale: string;
  now?: number;
  labels: CommentHistoryLabels;
  words: CommentModerationLabels;
  /** Open at first (the thread view opens it for a comment reached from a notification). */
  defaultOpen?: boolean;
}

/**
 * A comment's moderation history in a `Collapsible` (RFC-0007 §14 thread): newest first, each
 * event with its action, actor (`ActorBadge` + name, "Approved by Ayşe for Comment triage"),
 * time, reason in words and the note as plain text. No comment text is in an event.
 */
export function CommentHistory({
  events,
  locale,
  now,
  labels,
  words,
  defaultOpen = false,
}: CommentHistoryProps) {
  const [open, setOpen] = useState(defaultOpen);
  const sorted = [...events].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.DefaultTrigger>{labels.title(events.length)}</Collapsible.DefaultTrigger>
      <Collapsible.DefaultPanel>
        {sorted.length === 0 ? (
          <Text variant="secondary">{labels.empty}</Text>
        ) : (
          <ol className="m-0 grid list-none gap-3 p-0" data-testid="comment-history">
            {sorted.map((e) => {
              const t = formatCommentTime(e.at, locale, now);
              return (
                <li key={e.id} className="grid min-w-0 gap-1" data-event-action={e.action}>
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <Text as="span" bold>
                      {words.action[e.action]}
                    </Text>
                    {e.reasonCode && (
                      <Text as="span" variant="secondary">
                        · {words.reason[e.reasonCode]}
                      </Text>
                    )}
                    <time dateTime={e.at} title={t.absolute}>
                      <Text as="span" variant="secondary" size="sm">
                        · {t.relative}
                      </Text>
                    </time>
                  </span>
                  <ActorLine actor={e.actor} words={words} approvedBy={e.approvedBy} />
                  {e.note && (
                    <span dir="auto" className="block min-w-0 whitespace-pre-line wrap-anywhere">
                      <Text as="span" variant="secondary">
                        {e.note}
                      </Text>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </Collapsible.DefaultPanel>
    </Collapsible.Root>
  );
}
