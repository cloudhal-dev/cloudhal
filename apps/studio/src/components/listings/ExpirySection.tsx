import type { CollectionExpiry, CollectionSettings, Site } from "@cloudhal/core-contracts";
import { fieldGateInstant, fieldLabel } from "@cloudhal/core-ts/fields";
import { Banner, Button, Input, Radio, Select, Text } from "@cloudhal/ui";
import { CloudArrowUp } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { api, errorCode } from "../../lib/api.ts";
import { dateFields, liveFields } from "../../lib/listings.ts";
import { ErrorBanner } from "../ErrorBanner.tsx";
import { SettingsSection } from "../Settings.tsx";
import { SwitchField } from "../TaxonomySettingsDialog.tsx";
import { useNow } from "../useNow.ts";
import { LISTING_SECTIONS } from "./sections.ts";
import { same, useSaveSetting } from "./useSaveSetting.ts";

/** The contract's longest grace: one week. */
const MAX_GRACE = 10_080;

interface Form {
  on: boolean;
  field: string;
  action: CollectionExpiry["action"];
  grace: string;
}

const formOf = (expiry: CollectionExpiry | undefined, first: string): Form => ({
  on: expiry !== undefined,
  field: expiry?.field ?? first,
  action: expiry?.action ?? "unlist",
  grace: expiry?.afterMinutes ? String(expiry.afterMinutes) : "",
});

/** The rule the form describes; `undefined` when off (or without a field). */
export function expiryOf(form: Form): CollectionExpiry | undefined {
  if (!form.on || !form.field) return undefined;
  const grace = Math.min(MAX_GRACE, Math.max(0, Math.trunc(Number(form.grace) || 0)));
  return { field: form.field, action: form.action, ...(grace > 0 ? { afterMinutes: grace } : {}) };
}

/** Published entries of the collection already past the rule (counted in Studio, RFC-0042 §7). */
function usePastCount(site: Site, collection: string, rule: CollectionExpiry | undefined) {
  const now = useNow(60_000);
  const published = useQuery({
    queryKey: ["entries", site.id, collection, "published"],
    queryFn: () => api.entries.list(site.id, { collection, status: ["published"] }),
    enabled: rule !== undefined,
  });
  return useMemo(() => {
    const def =
      rule && liveFields(site.collections?.[collection] ?? {}).find((d) => d.key === rule.field);
    if (!def || !published.data) return undefined;
    return published.data.filter((e) => {
      const at = fieldGateInstant(e.fields?.[def.key], def, site, rule?.afterMinutes ?? 0);
      return at !== undefined && at <= now;
    }).length;
  }, [rule, published.data, site, collection, now]);
}

/**
 * A collection › Settings › Expiry (RFC-0042 §3, §7): the date field entries end on (dates and
 * dates with times only), what happens then (leave lists, or hide the page) in words, the grace,
 * and how many published entries are already past it. A site Worker that does not apply derived
 * gates refuses the rule (`gates_unsupported`): the card says to deploy first.
 */
export function ExpirySection({
  site,
  collection,
  settings,
  readOnlyReason,
}: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
  readOnlyReason: string | undefined;
}) {
  const { t, locale } = useI18n("listings");
  const dates = dateFields(liveFields(settings));
  const first = dates[0]?.key ?? "";
  const saved = settings.expiry;
  const [form, setForm] = useState(() => formOf(saved, first));
  const savedKey = JSON.stringify(saved ?? null);
  useEffect(() => setForm(formOf(saved, first)), [savedKey, first]);
  const save = useSaveSetting(site, collection, "expiry", t("listings.expiry.saved"));
  const rule = expiryOf(form);
  const past = usePastCount(site, collection, rule);
  const dirty = !same(rule, saved);
  const canEdit = readOnlyReason === undefined;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const unsupported = errorCode(save.error) === "gates_unsupported";
  return (
    <SettingsSection
      id={LISTING_SECTIONS.expiry}
      title={t("listings.expiry.title")}
      description={t("listings.expiry.description")}
      footer={
        <>
          {dirty && (
            <Button
              variant="ghost"
              onClick={() => setForm(formOf(saved, first))}
              disabled={save.isPending}
            >
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            onClick={() => save.mutate(rule)}
            loading={save.isPending}
            disabled={!canEdit || !dirty}
            title={readOnlyReason}
            data-testid="save-expiry"
          >
            {t("listings.expiry.save")}
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {unsupported ? (
          <Banner
            variant="alert"
            icon={<CloudArrowUp weight="bold" />}
            title={t("errors.title")}
            description={t("listings.expiry.gatesUnsupported")}
            data-testid="expiry-gates-unsupported"
          />
        ) : (
          <ErrorBanner error={save.error} />
        )}
        {dates.length === 0 && !saved ? (
          <Text variant="secondary">{t("listings.expiry.noDateFields")}</Text>
        ) : (
          <>
            <SwitchField
              label={t("listings.expiry.enabled")}
              hint={t("listings.expiry.enabledHint")}
              checked={form.on}
              onChange={(v) => set("on", v)}
              disabled={!canEdit}
              testId="expiry-on"
            />
            {form.on && (
              <>
                <Select
                  className="w-full"
                  label={t("listings.expiry.field")}
                  description={t("listings.expiry.fieldHint")}
                  value={form.field}
                  onValueChange={(v) => set("field", v as string)}
                  items={Object.fromEntries(
                    dates.map((d) => [d.key, fieldLabel(d, locale, site.defaultLocale)]),
                  )}
                  data-testid="expiry-field"
                />
                <Radio.Group
                  appearance="card"
                  legend={t("listings.expiry.action")}
                  value={form.action}
                  onValueChange={(v) => set("action", v === "hide" ? "hide" : "unlist")}
                >
                  <Radio.Item
                    value="unlist"
                    label={t("listings.expiry.unlist")}
                    description={t("listings.expiry.unlistDescription")}
                  />
                  <Radio.Item
                    value="hide"
                    label={t("listings.expiry.hide")}
                    description={t("listings.expiry.hideDescription")}
                  />
                </Radio.Group>
                <Input
                  className="w-full"
                  type="number"
                  min={0}
                  max={MAX_GRACE}
                  step={1}
                  label={t("listings.expiry.grace")}
                  description={t("listings.expiry.graceHint")}
                  value={form.grace}
                  onValueChange={(v) => set("grace", v)}
                  required={false}
                  data-testid="expiry-grace"
                />
                {past !== undefined && (
                  <Text variant="secondary" data-testid="expiry-past">
                    {t("listings.expiry.past", { count: past })}
                  </Text>
                )}
              </>
            )}
          </>
        )}
      </div>
    </SettingsSection>
  );
}
