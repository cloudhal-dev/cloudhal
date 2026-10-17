/**
 * Site › Settings › AI (RFC-0016 §2, DESIGN.md §2y): the switch for in-editor AI, the model
 * (recommended models first, then the account's Workers AI catalogue), the daily cap with today's
 * use, and — under "AI Gateway and other providers" — a gateway id and a `provider/model` that runs
 * through it. Words come from the lazy `aiSettings` namespace, loaded with the settings route.
 */
import { formatNumber } from "@cloudhal/messages/format";
import {
  Badge,
  Banner,
  Button,
  Collapsible,
  Combobox,
  Input,
  Meter,
  SkeletonLine,
  Switch,
  Text,
} from "@cloudhal/ui";
import { ArrowClockwise, Sparkle, WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { type AiPickerModel, type AiSettings, ApiRequestError, api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { SettingRow, SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const AI_SETTINGS_SECTION = "ai";

const WORKERS_AI_MODEL = /^@(cf|hf)\/[A-Za-z0-9._-]+\/[A-Za-z0-9._:-]+$/;
const PROVIDER_MODEL = /^[a-z0-9][a-z0-9-]{0,40}\/[A-Za-z0-9._:/-]{1,120}$/;
const GATEWAY_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const MAX_LIMIT = 10_000;

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

interface ModelOption {
  value: string;
  label: string;
  model: AiPickerModel;
}

interface Form {
  enabled: boolean;
  /** The Workers AI model chosen in the picker. */
  model: string;
  /** `provider/model` through the gateway; when set, it is the model used. */
  provider: string;
  gateway: string;
  limit: string;
}

const formOf = (s: AiSettings): Form => ({
  enabled: s.enabled,
  model: WORKERS_AI_MODEL.test(s.model) ? s.model : "",
  provider: WORKERS_AI_MODEL.test(s.model) ? "" : s.model,
  gateway: s.gateway ?? "",
  limit: String(s.dailyLimit),
});

export function AiSettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n("aiSettings");
  const a = "aiSettings" as const;
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("ai.settings");
  const key = ["ai", siteId, "settings"] as const;
  const settings = useQuery({ queryKey: key, queryFn: () => api.ai.settings(siteId) });
  const transport = settings.data?.transport;
  const picker = useQuery({
    queryKey: ["ai", siteId, "models"],
    queryFn: () => api.ai.models(siteId),
    enabled: gate.allowed && transport !== undefined && transport !== "none",
    staleTime: 10 * 60 * 1000,
    retry: false,
  });
  const saved = settings.data?.settings;
  const [form, setForm] = useState<Form | undefined>();
  useEffect(() => {
    if (saved) setForm(formOf(saved));
  }, [saved]);
  const [advanced, setAdvanced] = useState(false);
  useEffect(() => {
    if (saved && (saved.gateway || !WORKERS_AI_MODEL.test(saved.model))) setAdvanced(true);
  }, [saved]);

  const options: ModelOption[] = useMemo(() => {
    const models = picker.data?.models ?? [];
    const list =
      form?.model && !models.some((m) => m.id === form.model)
        ? [...models, { id: form.model, listed: false }]
        : models;
    return list.map((m) => ({
      value: m.id,
      label: m.recommended ? `${m.id} · ${t(`${a}.model.recommended`)}` : m.id,
      model: m,
    }));
  }, [picker.data, form?.model, t]);

  const save = useMutation({
    mutationFn: (f: Form) => {
      const provider = f.provider.trim();
      return api.ai.save(siteId, {
        enabled: f.enabled,
        model: provider || f.model,
        ...(f.gateway.trim() ? { gateway: f.gateway.trim() } : {}),
        dailyLimit: Number(f.limit),
        rev: saved?.rev ?? 0,
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["ai", siteId] });
      toast.success(t(`${a}.saved`));
    },
  });

  const unavailable = transport === "none";
  const header = (
    <>
      {unavailable && (
        <Banner
          variant="secondary"
          icon={<WarningCircle weight="fill" />}
          title={t(`${a}.unavailable.title`)}
          description={t(`${a}.unavailable.description`)}
        />
      )}
    </>
  );
  if (!form || !saved)
    return (
      <SettingsSection id={AI_SETTINGS_SECTION} title={t(`${a}.title`)}>
        <div className="grid gap-3" role="status">
          <span className="sr-only">{t("common.loading")}</span>
          <SkeletonLine minWidth={30} maxWidth={45} />
          <SkeletonLine minWidth={60} maxWidth={85} />
        </div>
      </SettingsSection>
    );

  const limit = Number(form.limit);
  const limitValid =
    form.limit.trim() !== "" && Number.isInteger(limit) && limit >= 0 && limit <= MAX_LIMIT;
  const gatewayValid = form.gateway.trim() === "" || GATEWAY_ID.test(form.gateway.trim());
  const provider = form.provider.trim();
  const providerValid =
    provider === "" || (PROVIDER_MODEL.test(provider) && !provider.startsWith("@"));
  const providerNeedsGateway = provider !== "" && form.gateway.trim() === "";
  const effective = provider || form.model;
  const valid =
    limitValid && gatewayValid && providerValid && !providerNeedsGateway && effective !== "";
  const current = formOf(saved);
  const dirty = JSON.stringify(form) !== JSON.stringify(current);
  const chosen = options.find((o) => o.value === form.model) ?? null;
  const gone =
    picker.data?.catalog === "live" &&
    !provider &&
    form.model !== "" &&
    !(picker.data.models ?? []).some((m) => m.id === form.model && m.listed);
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const usage = settings.data?.usage;
  const disabled = !gate.allowed;

  return (
    <SettingsSection
      id={AI_SETTINGS_SECTION}
      title={t(`${a}.title`)}
      description={t(`${a}.description`)}
      aside={
        saved.enabled ? (
          <Badge variant="success" icon={<Sparkle />}>
            {t("common.on")}
          </Badge>
        ) : undefined
      }
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => setForm(current)}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || !valid || disabled}
            title={gate.reason}
            loading={save.isPending}
            onClick={() => save.mutate(form)}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {header}
      {save.error && (
        <Banner
          variant={isConflict(save.error) ? "alert" : "error"}
          icon={<WarningCircle weight="fill" />}
          title={t(`${a}.failed`)}
          description={isConflict(save.error) ? t(`${a}.conflict`) : apiErrorText(t, save.error)}
          action={
            isConflict(save.error) ? (
              <Banner.Action
                variant="secondary"
                icon={<ArrowClockwise />}
                onClick={() => {
                  save.reset();
                  void settings.refetch();
                }}
              >
                {t(`${a}.reload`)}
              </Banner.Action>
            ) : undefined
          }
        />
      )}
      {gone && (
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          description={t(`${a}.model.gone`, { model: form.model })}
        />
      )}
      <dl className="-my-3 divide-y divide-kumo-hairline" data-testid="ai-settings">
        <SettingRow label={t(`${a}.enabled.label`)} hint={t(`${a}.enabled.hint`)}>
          <Switch
            aria-label={t(`${a}.enabled.label`)}
            checked={form.enabled}
            disabled={disabled}
            title={gate.reason}
            onCheckedChange={(on: boolean) => set({ enabled: on })}
          />
        </SettingRow>
        <SettingRow
          label={t(`${a}.model.label`)}
          hint={
            <>
              {t(`${a}.model.hint`)}{" "}
              {provider
                ? t(`${a}.model.privacyProvider`, { provider: provider.split("/")[0] ?? "" })
                : t(`${a}.model.privacyWorkers`)}
            </>
          }
        >
          <span className="grid w-80 max-w-full gap-1.5" data-testid="ai-model">
            {disabled || unavailable || picker.isError ? (
              <Text as="span">
                <span className="font-mono text-[0.9em]">{effective}</span>
              </Text>
            ) : picker.isPending ? (
              <SkeletonLine minWidth={60} maxWidth={90} />
            ) : (
              <Combobox
                items={options}
                value={chosen}
                onValueChange={(v) => set({ model: (v as ModelOption | null)?.value ?? "" })}
                isItemEqualToValue={(x: ModelOption, y: ModelOption) => x.value === y.value}
                itemToStringLabel={(o: ModelOption) => o.label}
                aria-label={t(`${a}.model.label`)}
                disabled={provider !== ""}
              >
                <Combobox.TriggerInput
                  placeholder={t(`${a}.model.placeholder`)}
                  clearLabel={t(`${a}.model.clear`)}
                  showOptionsLabel={t(`${a}.model.show`)}
                />
                <Combobox.Content>
                  <Combobox.Empty>{t(`${a}.model.empty`)}</Combobox.Empty>
                  <Combobox.List>
                    {(o: ModelOption) => (
                      <Combobox.Item key={o.value} value={o}>
                        {o.label}
                      </Combobox.Item>
                    )}
                  </Combobox.List>
                </Combobox.Content>
              </Combobox>
            )}
            {chosen?.model.recommended && !provider && (
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.model.notes.${chosen.model.recommended}`)}
              </Text>
            )}
            {chosen?.model.contextWindow && !provider ? (
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.model.context`, {
                  tokens: formatNumber(locale, chosen.model.contextWindow),
                })}
              </Text>
            ) : null}
            {picker.data?.catalog === "unavailable" && (
              <Text variant="secondary" size="sm" as="span">
                {t(`${a}.model.catalogUnavailable`)}
              </Text>
            )}
          </span>
        </SettingRow>
        <SettingRow label={t(`${a}.limit.label`)} hint={t(`${a}.limit.hint`)}>
          <span className="grid w-56 max-w-full gap-2">
            <Input
              type="number"
              inputMode="numeric"
              aria-label={t(`${a}.limit.label`)}
              value={form.limit}
              onValueChange={(v: string) => set({ limit: v })}
              disabled={disabled}
              title={gate.reason}
              error={limitValid ? undefined : t(`${a}.limit.error`)}
              className="w-full"
            />
            {usage && (
              <Meter
                label={t(`${a}.limit.used`, {
                  used: formatNumber(locale, usage.requests),
                  limit: formatNumber(locale, saved.dailyLimit),
                })}
                value={usage.requests}
                max={Math.max(1, saved.dailyLimit)}
              />
            )}
          </span>
        </SettingRow>
      </dl>
      <Collapsible.Root open={advanced} onOpenChange={setAdvanced}>
        <Collapsible.DefaultTrigger>{t(`${a}.advanced`)}</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="grid gap-4 pt-2" data-testid="ai-advanced">
            <Input
              label={t(`${a}.gateway.label`)}
              description={t(`${a}.gateway.hint`)}
              placeholder={t(`${a}.gateway.placeholder`)}
              value={form.gateway}
              onValueChange={(v: string) => set({ gateway: v })}
              disabled={disabled}
              error={gatewayValid ? undefined : t(`${a}.gateway.error`)}
              className="w-full max-w-sm"
            />
            <Input
              label={t(`${a}.provider.label`)}
              description={t(`${a}.provider.hint`)}
              placeholder={t(`${a}.provider.placeholder`)}
              value={form.provider}
              onValueChange={(v: string) => set({ provider: v })}
              disabled={disabled}
              error={
                !providerValid
                  ? t(`${a}.provider.error`)
                  : providerNeedsGateway
                    ? t(`${a}.provider.needsGateway`)
                    : undefined
              }
              className="w-full max-w-sm"
            />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </SettingsSection>
  );
}
