import { Banner, Checkbox, ClipboardText, Input, LayerDialog, Tabs, Text } from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { ShieldWarning, Warning } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useT } from "../i18n/index.tsx";
import {
  canRelease,
  DEFAULT_SCOPES,
  type GrantableScope,
  mcpSnippet,
  SCOPE_GROUPS,
  type ScopeGroup,
  type SnippetKind,
} from "../lib/agents.ts";
import { api, type CreatedAgentKey } from "../lib/api.ts";

/**
 * Create-key flow in one `LayerDialog` (DESIGN.md §2g): name + grouped scopes, then a one-time
 * reveal of the plaintext key with copy affordances. The key lives only in this component's state
 * and is dropped as soon as the dialog closes.
 */
export function CreateAgentKeyDialog({
  open,
  onOpenChange,
  endpoint,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: string;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<GrantableScope[]>(DEFAULT_SCOPES);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<CreatedAgentKey | undefined>();
  const [snippet, setSnippet] = useState<SnippetKind>("json");

  const create = useMutation({
    mutationFn: () => api.agentKeys.create({ name: name.trim(), scopes }),
    onSuccess: async (key) => {
      setCreated(key);
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
    },
  });

  // Every opening starts from a clean form; closing forgets the plaintext key.
  useEffect(() => {
    if (open) {
      setName("");
      setScopes(DEFAULT_SCOPES);
      setSubmitted(false);
      setSnippet("json");
      create.reset();
    } else {
      setCreated(undefined);
    }
  }, [open]);

  const nameError = submitted && !name.trim() ? t("agents.create.nameRequired") : undefined;
  const scopesError =
    submitted && scopes.length === 0 ? t("agents.create.scopesRequired") : undefined;
  const submit = () => {
    setSubmitted(true);
    if (create.isPending || !name.trim() || scopes.length === 0) return;
    create.mutate();
  };
  const toggle = (scope: GrantableScope, on: boolean) =>
    setScopes((prev) => (on ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope)));

  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>
          {created ? t("agents.reveal.title") : t("agents.create.title")}
        </LayerDialog.Title>
        <LayerDialog.Description>
          {created
            ? t("agents.reveal.description", { name: created.name ?? t("agents.unnamed") })
            : t("agents.create.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          {created ? (
            <div className="grid gap-5" data-testid="key-reveal">
              <Banner
                variant="alert"
                icon={<Warning weight="fill" />}
                title={t("agents.reveal.warningTitle")}
                description={t("agents.reveal.warning")}
              />
              <div className="grid gap-1.5">
                <Text size="sm" bold as="span">
                  {t("agents.reveal.key")}
                </Text>
                <ClipboardText
                  size="lg"
                  text={created.key}
                  tooltip={{ text: t("common.copy"), copiedText: t("common.copied") }}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Text size="sm" bold as="span">
                    {t("agents.reveal.config")}
                  </Text>
                  <Tabs
                    variant="segmented"
                    size="sm"
                    value={snippet}
                    onValueChange={(v) => setSnippet(v as SnippetKind)}
                    tabs={(["json", "claude"] as const).map((k) => ({
                      value: k,
                      label: t(`agents.connect.tabs.${k}`),
                    }))}
                  />
                </div>
                <div className="min-w-0 overflow-x-auto">
                  <CodeHighlighted
                    code={mcpSnippet(snippet, endpoint, created.key)}
                    lang={snippet === "json" ? "json" : "bash"}
                    showCopyButton
                  />
                </div>
              </div>
            </div>
          ) : (
            // Deliberately no form element: Base UI checkboxes render as buttons and would submit it.
            <div className="grid gap-6">
              {create.error && (
                <Banner
                  variant="error"
                  size="sm"
                  title={t("agents.create.failed")}
                  description={create.error.message}
                />
              )}
              <Input
                label={t("agents.create.name")}
                placeholder={t("agents.create.namePlaceholder")}
                description={t("agents.create.nameHint")}
                value={name}
                onValueChange={setName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                error={nameError}
                autoFocus
                maxLength={64}
              />
              <fieldset className="grid min-w-0 gap-4" aria-label={t("agents.create.scopes")}>
                <div className="grid gap-1.5">
                  <Text bold as="span">
                    {t("agents.create.scopes")}
                  </Text>
                  {scopesError && (
                    <Text variant="error" size="sm">
                      {scopesError}
                    </Text>
                  )}
                </div>
                {(Object.entries(SCOPE_GROUPS) as Array<[ScopeGroup, GrantableScope[]]>).map(
                  ([group, groupScopes]) => (
                    <div
                      key={group}
                      className="grid gap-3 rounded-lg px-4 py-3 ring ring-kumo-hairline"
                      data-scope-group={group}
                    >
                      <div className="grid gap-0.5">
                        <Text size="sm" bold as="span">
                          {t(`agents.create.groups.${group}`)}
                        </Text>
                        <Text variant="secondary" size="sm">
                          {t(`agents.create.groupHints.${group}`)}
                        </Text>
                      </div>
                      <div className="grid gap-2.5">
                        {groupScopes.map((scope) => (
                          <Checkbox
                            key={scope}
                            checked={scopes.includes(scope)}
                            onCheckedChange={(on) => toggle(scope, on === true)}
                            label={
                              <span className="flex flex-wrap items-baseline gap-x-2">
                                <span>{t(`agents.scopes.${scope}`)}</span>
                                <span className="font-mono text-[0.9em] text-kumo-subtle">
                                  {scope}
                                </span>
                              </span>
                            }
                          />
                        ))}
                      </div>
                    </div>
                  ),
                )}
                {canRelease(scopes) && (
                  <Banner
                    variant="alert"
                    icon={<ShieldWarning weight="fill" />}
                    title={t("agents.create.releaseWarningTitle")}
                    description={t("agents.create.releaseWarning")}
                  />
                )}
              </fieldset>
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={created ? t("common.close") : t("common.cancel")}>
          {created ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {t("agents.reveal.done")}
            </LayerDialog.Actions.Primary>
          ) : (
            <LayerDialog.Actions.Primary onClick={submit} loading={create.isPending}>
              {t("agents.create.submit")}
            </LayerDialog.Actions.Primary>
          )}
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
