import {
  Badge,
  Banner,
  Button,
  Checkbox,
  ClipboardText,
  Collapsible,
  Input,
  InsetPanel,
  LayerDialog,
  Tabs,
  Text,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { ArrowCounterClockwise, Info, Warning } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listOf, useT } from "../i18n/index.tsx";
import {
  type GrantableScope,
  mcpSnippet,
  SCOPE_GROUPS,
  type ScopeGroup,
  type SnippetKind,
  sameScopes,
  scopeOptions,
} from "../lib/agents.ts";
import { api, type CreatedAgentKey, errorCode, type KeyMode } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { AutoModeConfirm, BypassHint, ModeBadge, ModePicker } from "./AgentModes.tsx";
import { useAgentModeRules } from "./useAgentModeRules.ts";

type Step = "mode" | "details";

/**
 * Create-key flow in one `LayerDialog` (DESIGN.md §2g): (1) choose a mode with radio cards, (2) name
 * the key and, under "Advanced", adjust the scopes prefilled from the mode, then (3) a one-time
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
  const rules = useAgentModeRules();
  const [step, setStep] = useState<Step>("mode");
  const [mode, setMode] = useState<KeyMode>(rules.defaultMode);
  // Whether the person picked a mode yet; until then the server's default (once known) applies.
  const [modeTouched, setModeTouched] = useState(false);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [modeSubmitted, setModeSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<GrantableScope[]>(rules.scopesFor(rules.defaultMode));
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [created, setCreated] = useState<CreatedAgentKey | undefined>();
  const [snippet, setSnippet] = useState<SnippetKind>("json");

  const modeScopes = rules.scopesFor(mode);
  const customised = !sameScopes(scopes, modeScopes);
  const missing = modeScopes.filter((s) => !scopes.includes(s));

  const create = useMutation({
    // Scopes the mode would get anyway are left to the server (`scopesForMode`).
    mutationFn: () =>
      api.agentKeys.create({ name: name.trim(), mode, ...(customised ? { scopes } : {}) }),
    onSuccess: async (key) => {
      setCreated(key);
      await qc.invalidateQueries({ queryKey: ["agent-keys"] });
    },
  });

  // Every opening starts from a clean form; closing forgets the plaintext key.
  useEffect(() => {
    if (open) {
      setStep("mode");
      setMode(rules.defaultMode);
      setModeTouched(false);
      setAutoConfirmed(false);
      setModeSubmitted(false);
      setName("");
      setScopes(rules.scopesFor(rules.defaultMode));
      setAdvancedOpen(false);
      setSubmitted(false);
      setSnippet("json");
      create.reset();
    } else {
      setCreated(undefined);
    }
  }, [open]);

  // `/api/instance` may answer after the dialog opened: adopt its default if nothing was picked.
  useEffect(() => {
    if (!modeTouched && step === "mode") {
      setMode(rules.defaultMode);
      setScopes(rules.scopesFor(rules.defaultMode));
    }
  }, [rules]);

  const chooseMode = (next: KeyMode) => {
    setModeTouched(true);
    setMode(next);
    setScopes(rules.scopesFor(next));
    setAutoConfirmed(false);
    setModeSubmitted(false);
  };
  const continueToDetails = () => {
    setModeSubmitted(true);
    if (mode === "auto" && !autoConfirmed) return;
    setStep("details");
  };

  const nameError = submitted && !name.trim() ? t("agents.create.nameRequired") : undefined;
  const scopesError =
    submitted && scopes.length === 0 ? t("agents.create.scopesRequired") : undefined;
  const submit = () => {
    setSubmitted(true);
    if (scopes.length === 0) setAdvancedOpen(true);
    if (create.isPending || !name.trim() || scopes.length === 0) return;
    create.mutate();
  };
  const toggle = (scope: GrantableScope, on: boolean) =>
    setScopes((prev) => (on ? [...new Set([...prev, scope])] : prev.filter((s) => s !== scope)));
  const modeName = t(`agents.modes.names.${mode}`);

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
          ) : step === "mode" ? (
            <div className="grid gap-5" data-testid="create-step-mode">
              <Text variant="secondary" size="sm">
                {t("agents.create.stepMode")}
              </Text>
              <ModePicker
                value={mode}
                onValueChange={chooseMode}
                legend={t("agents.modes.legend")}
              />
              {mode === "auto" && (
                <AutoModeConfirm
                  checked={autoConfirmed}
                  onCheckedChange={setAutoConfirmed}
                  showError={modeSubmitted}
                />
              )}
              <BypassHint />
            </div>
          ) : (
            // Deliberately no form element: Base UI checkboxes render as buttons and would submit it.
            <div className="grid gap-6" data-testid="create-step-details">
              <Text variant="secondary" size="sm">
                {t("agents.create.stepDetails")}
              </Text>
              {create.error && (
                <Banner
                  variant="error"
                  size="sm"
                  title={t("agents.create.failed")}
                  description={
                    errorCode(create.error) === "scope_above_role"
                      ? t("agents.create.errors.scopeAboveRole")
                      : errorCode(create.error) === "mode_above_role"
                        ? t("agents.create.errors.modeAboveRole")
                        : apiErrorText(t, create.error)
                  }
                />
              )}
              <InsetPanel layout="row" label={t("agents.create.mode")}>
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Text size="sm" bold as="span">
                      {t("agents.create.mode")}
                    </Text>
                    <ModeBadge mode={mode} />
                  </div>
                  <Text variant="secondary" size="sm">
                    {t("agents.modes.waitsFor", { mode })}
                  </Text>
                </div>
                <Button variant="secondary" size="sm" onClick={() => setStep("mode")}>
                  {t("agents.create.changeMode")}
                </Button>
              </InsetPanel>
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
              <Collapsible.Root open={advancedOpen} onOpenChange={setAdvancedOpen}>
                <Collapsible.DefaultTrigger>
                  <span className="flex flex-wrap items-center gap-2">
                    <span>{t("agents.create.advanced")}</span>
                    {customised && <Badge variant="info">{t("agents.create.customised")}</Badge>}
                  </span>
                </Collapsible.DefaultTrigger>
                <Collapsible.DefaultPanel>
                  <fieldset
                    className="grid min-w-0 gap-4 pt-1"
                    aria-label={t("agents.create.scopes")}
                    data-testid="advanced-scopes"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="grid min-w-0 flex-1 gap-1.5">
                        <Text variant="secondary" size="sm">
                          {t("agents.create.advancedHint", { mode: modeName })}
                        </Text>
                        {scopesError && (
                          <Text variant="error" size="sm">
                            {scopesError}
                          </Text>
                        )}
                      </div>
                      {customised && (
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<ArrowCounterClockwise />}
                          onClick={() => setScopes(modeScopes)}
                        >
                          {t("agents.create.resetScopes")}
                        </Button>
                      )}
                    </div>
                    {(Object.keys(SCOPE_GROUPS) as ScopeGroup[]).map((group) => (
                      <InsetPanel
                        key={group}
                        label={t(`agents.create.groups.${group}`)}
                        className="gap-3"
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
                          {/* Narrowed to the person's role (RFC-0005 §5.1): an own variant in
                                place of the full scope, or the scope disabled with the reason. */}
                          {scopeOptions(group, rules.roleScopes).map(
                            ({ scope, from, disabled }) => (
                              <div key={from ?? scope} className="grid gap-0.5">
                                <Checkbox
                                  checked={!disabled && scopes.includes(scope)}
                                  disabled={disabled}
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
                                {(disabled || from) && (
                                  <span className="pl-6">
                                    <Text variant="secondary" size="sm">
                                      {disabled
                                        ? t("agents.create.scopeAboveRole")
                                        : t("agents.create.scopeNarrowed", { scope: from ?? "" })}
                                    </Text>
                                  </span>
                                )}
                              </div>
                            ),
                          )}
                        </div>
                      </InsetPanel>
                    ))}
                    {missing.length > 0 && scopes.length > 0 && (
                      <Banner
                        variant="secondary"
                        size="sm"
                        icon={<Info weight="fill" />}
                        title={t("agents.create.missingScopesTitle")}
                        description={t("agents.create.missingScopes", {
                          scopes: listOf(missing),
                          mode: modeName,
                        })}
                      />
                    )}
                  </fieldset>
                </Collapsible.DefaultPanel>
              </Collapsible.Root>
            </div>
          )}
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={created ? t("common.close") : t("common.cancel")}>
          {created ? (
            <LayerDialog.Actions.Primary onClick={() => onOpenChange(false)}>
              {t("agents.reveal.done")}
            </LayerDialog.Actions.Primary>
          ) : step === "mode" ? (
            <LayerDialog.Actions.Primary onClick={continueToDetails}>
              {t("agents.create.continue")}
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
