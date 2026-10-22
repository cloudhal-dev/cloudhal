import { Badge, ClipboardText, LayerDialog, Text } from "@cloudhal/ui";
import { FileText, HandPalm } from "@phosphor-icons/react";
import { type ReactNode, useRef } from "react";
import { useT } from "../i18n/index.tsx";
import type { SkillSummary } from "../lib/api.ts";
import { isAgentScope, orderSkillScopes, skillCallSnippet } from "../lib/skills.ts";
import { useToolLabel } from "./Audit.tsx";
import { CodeHighlighted } from "./CodeHighlighted.tsx";
import { ScopeBadge } from "./ScopeBadge.tsx";

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5 py-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
      <dt className="grid content-start gap-0.5">
        <Text variant="secondary" size="sm" as="span">
          {label}
        </Text>
      </dt>
      <dd className="grid min-w-0 gap-1.5">
        {children}
        {hint && (
          <Text variant="secondary" size="sm">
            {hint}
          </Text>
        )}
      </dd>
    </div>
  );
}

/** A scope as the agent-keys page shows it; scopes Studio doesn't know stay raw. */
export function SkillScope({ scope }: { scope: string }) {
  if (isAgentScope(scope)) return <ScopeBadge scope={scope} />;
  return (
    <Badge variant="outline">
      <span className="font-mono text-[0.9em]">{scope}</span>
    </Badge>
  );
}

/** Tool that waits for a person under this skill: localised label, raw MCP name in mono. */
export function ApprovalTool({ tool }: { tool: string }) {
  const label = useToolLabel();
  return (
    <Badge variant="warning" icon={<HandPalm />}>
      {label(tool) === tool ? <span className="font-mono text-[0.9em]">{tool}</span> : label(tool)}
    </Badge>
  );
}

/**
 * Everything about one skill in a `LayerDialog` (bottom sheet on phones): scopes, approvals,
 * requirements, reference files, the `skill://` resource and a ready `tools/call` with `_meta`.
 */
export function SkillDetailDialog({
  skill: current,
  onOpenChange,
}: {
  /** `undefined` closes the dialog (it stays mounted to animate). */
  skill: SkillSummary | undefined;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const last = useRef(current);
  if (current) last.current = current;
  const skill = current ?? last.current;
  return (
    <LayerDialog.Root open={current !== undefined} onOpenChange={onOpenChange}>
      <LayerDialog.Content size="lg" closeLabel={t("common.close")}>
        <LayerDialog.Title>{skill?.name ?? ""}</LayerDialog.Title>
        <LayerDialog.Description>{skill?.description ?? ""}</LayerDialog.Description>
        <LayerDialog.Body>
          {skill && (
            <div className="grid gap-5" data-testid="skill-detail">
              <dl className="grid divide-y divide-kumo-hairline">
                <Row label={t("skills.detail.scopes")} hint={t("skills.detail.scopesHint")}>
                  <div className="flex flex-wrap gap-1">
                    {orderSkillScopes(skill.scopes).map((s) => (
                      <SkillScope key={s} scope={s} />
                    ))}
                  </div>
                </Row>
                <Row
                  label={t("skills.detail.approval")}
                  hint={skill.approval.length > 0 ? t("skills.detail.approvalHint") : undefined}
                >
                  {skill.approval.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {skill.approval.map((tool) => (
                        <ApprovalTool key={tool} tool={tool} />
                      ))}
                    </div>
                  ) : (
                    <Text variant="secondary">{t("skills.detail.noApproval")}</Text>
                  )}
                </Row>
                {skill.requiresCapabilities.length > 0 && (
                  <Row label={t("skills.detail.requires")}>
                    <div className="flex flex-wrap gap-1">
                      {skill.requiresCapabilities.map((c) => (
                        <Badge key={c} variant="outline">
                          <span className="font-mono text-[0.9em]">{c}</span>
                        </Badge>
                      ))}
                    </div>
                  </Row>
                )}
                <Row label={t("skills.detail.references")}>
                  {skill.references.length > 0 ? (
                    <div className="grid gap-1">
                      {skill.references.map((r) => (
                        <div key={r} className="flex items-center gap-2">
                          <FileText size={16} className="shrink-0 text-kumo-subtle" />
                          <Text variant="mono" as="span">
                            {r}
                          </Text>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <Text variant="secondary">{t("skills.detail.noReferences")}</Text>
                  )}
                </Row>
                <Row label={t("skills.detail.resource")}>
                  <ClipboardText
                    size="sm"
                    text={skill.resource}
                    tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
                  />
                </Row>
              </dl>
              <div className="grid min-w-0 gap-2">
                <Text bold as="span">
                  {t("skills.detail.call")}
                </Text>
                <div className="min-w-0 overflow-x-auto">
                  <CodeHighlighted code={skillCallSnippet(skill)} lang="json" showCopyButton />
                </div>
              </div>
            </div>
          )}
        </LayerDialog.Body>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
