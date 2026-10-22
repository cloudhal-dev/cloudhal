/**
 * Site › Settings › Languages (RFC-0033 §8): the languages the site publishes in and how readers
 * reach them — the URL scheme, what a missing translation does, which content needs a person's
 * review before a machine translation goes live, and when readers see the machine-translation
 * notice. Saved on the Site (PUT, CAS on `rev`); the site follows after a publish.
 */
import type { Site } from "@cloudhal/core-contracts";
import { Badge, Banner, Button, Checkbox, Select, SkeletonLine, Table, Text } from "@cloudhal/ui";
import { WarningCircle, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { collectionNames, useCollections } from "../lib/collections.ts";
import { languageName } from "../lib/languages.ts";
import { EditionGuide } from "./EditionGuide.tsx";
import { LanguagePicker } from "./LanguagePicker.tsx";
import { SettingRow, SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const LANGUAGE_SETTINGS_SECTION = "languages";

type Localization = NonNullable<Site["localization"]>;
interface Form {
  locales: string[];
  routing: NonNullable<Localization["routing"]>;
  fallback: NonNullable<Localization["fallback"]>;
  label: NonNullable<Localization["label"]>;
  review: string[];
}

function formOf(site: Site): Form {
  const l = site.localization ?? {};
  return {
    locales: site.locales,
    routing: l.routing ?? "prefix-except-default",
    fallback: l.fallback ?? "none",
    label: l.label ?? "unreviewed",
    review: l.review?.required ?? [],
  };
}

/** The site with the form applied; settings at their defaults are left out. */
function withForm(site: Site, f: Form): Site {
  const localization: Localization = {
    ...(site.localization?.domains ? { domains: site.localization.domains } : {}),
    ...(f.routing !== "prefix-except-default" ? { routing: f.routing } : {}),
    ...(f.fallback !== "none" ? { fallback: f.fallback } : {}),
    ...(f.label !== "unreviewed" ? { label: f.label } : {}),
    ...(f.review.length ? { review: { required: f.review } } : {}),
  };
  const { localization: _l, ...rest } = site;
  return {
    ...rest,
    locales: f.locales as Site["locales"],
    ...(Object.keys(localization).length ? { localization } : {}),
  };
}

export function LanguageSettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const [form, setForm] = useState<Form | undefined>();
  useEffect(() => {
    if (site.data) setForm(formOf(site.data));
  }, [site.data]);
  const save = useMutation({
    mutationFn: (f: Form) => api.sites.update(withForm(site.data as Site, f)),
    onSuccess: (saved) => {
      qc.setQueryData(["site", siteId], saved);
      toast.success(t("languages.saved"));
    },
  });
  const title = t("languages.title");
  if (!site.data || !form)
    return (
      <SettingsSection id={LANGUAGE_SETTINGS_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  const def = site.data.defaultLocale;
  const name = (l: string) => languageName(locale, l);
  const dirty = JSON.stringify(form) !== JSON.stringify(formOf(site.data));
  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const disabled = !gate.allowed;
  return (
    <SettingsSection
      id={LANGUAGE_SETTINGS_SECTION}
      title={title}
      description={t("languages.description")}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => setForm(formOf(site.data as Site))}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || disabled}
            title={gate.reason}
            loading={save.isPending}
            onClick={() => save.mutate(form)}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {save.error && (
        <Banner
          variant="error"
          icon={<WarningCircle weight="fill" />}
          title={t("languages.failed")}
          description={
            save.error instanceof ApiRequestError && save.error.status === 409
              ? t("siteSettings.conflictDescription")
              : apiErrorText(t, save.error)
          }
        />
      )}
      <LocalesEditor form={form} set={set} def={def} name={name} disabled={disabled} />
      <EditionGuide siteId={siteId} />
      <LocalizationRows form={form} set={set} disabled={disabled} site={site.data} />
    </SettingsSection>
  );
}

interface EditorProps {
  form: Form;
  set: (patch: Partial<Form>) => void;
  disabled: boolean;
}

/** The site's languages: each by name and tag, the default marked, removable but the default. */
function LocalesEditor({
  form,
  set,
  def,
  name,
  disabled,
}: EditorProps & { def: string; name: (locale: string) => string }) {
  const { t } = useI18n();
  return (
    <>
      <Table>
        <Table.Header>
          <Table.Row>
            <Table.Head>{t("languages.language")}</Table.Head>
            <Table.Head>{t("languages.tag")}</Table.Head>
            <Table.Head sticky="right" />
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {form.locales.map((l) => (
            <Table.Row key={l} data-locale={l}>
              <Table.Cell>
                <span className="flex items-center gap-2">
                  {name(l)}
                  {l === def && <Badge variant="info">{t("languages.default")}</Badge>}
                </span>
              </Table.Cell>
              <Table.Cell>
                <Text variant="mono" as="span">
                  {l}
                </Text>
              </Table.Cell>
              <Table.Cell sticky="right" className="text-end">
                {l !== def && (
                  <Button
                    variant="ghost"
                    shape="square"
                    icon={<X />}
                    aria-label={t("languages.remove", { language: name(l) })}
                    disabled={disabled}
                    onClick={() => set({ locales: form.locales.filter((x) => x !== l) })}
                  />
                )}
              </Table.Cell>
            </Table.Row>
          ))}
        </Table.Body>
      </Table>
      <LanguagePicker
        taken={form.locales}
        disabled={disabled}
        onPick={(tag) => set({ locales: [...form.locales, tag] })}
      />
    </>
  );
}

/** Addresses, missing translations, review before publishing, the reader's notice. */
function LocalizationRows({ form, set, disabled, site }: EditorProps & { site: Site | undefined }) {
  const { t, locale } = useI18n();
  // Pages, then every collection of the registry (RFC-0040), `posts` first.
  const registry = useCollections(site?.id ?? "");
  const reviewable = [
    "pages",
    "posts",
    ...(registry.data ?? []).map((c) => c.key).filter((k) => k !== "posts"),
  ];
  return (
    <dl className="-mb-3 divide-y divide-kumo-hairline border-kumo-hairline border-t">
      <SettingRow label={t("languages.routing")} hint={t("languages.routingHint")}>
        <Select
          aria-label={t("languages.routing")}
          value={form.routing}
          onValueChange={(v) => set({ routing: v as Form["routing"] })}
          items={{
            "prefix-except-default": t("languages.routingOptions.prefixExceptDefault"),
            "prefix-all": t("languages.routingOptions.prefixAll"),
          }}
          disabled={disabled}
        />
      </SettingRow>
      <SettingRow label={t("languages.fallback")} hint={t("languages.fallbackHint")}>
        <Select
          aria-label={t("languages.fallback")}
          value={form.fallback}
          onValueChange={(v) => set({ fallback: v as Form["fallback"] })}
          items={{
            none: t("languages.fallbackOptions.none"),
            "default-with-notice": t("languages.fallbackOptions.defaultWithNotice"),
          }}
          disabled={disabled}
        />
      </SettingRow>
      <SettingRow label={t("languages.review")} hint={t("languages.reviewHint")}>
        <span className="grid gap-2">
          {reviewable.map((c) => (
            <Checkbox
              key={c}
              label={
                c === "pages" || c === "posts"
                  ? t(`languages.reviewOptions.${c as "pages" | "posts"}`)
                  : (collectionNames(site, c, locale)?.plural ?? c)
              }
              checked={form.review.includes(c)}
              disabled={disabled}
              onCheckedChange={(on) =>
                set({
                  review: on === true ? [...form.review, c] : form.review.filter((x) => x !== c),
                })
              }
            />
          ))}
        </span>
      </SettingRow>
      <SettingRow label={t("languages.label")} hint={t("languages.labelHint")}>
        <Select
          aria-label={t("languages.label")}
          value={form.label}
          onValueChange={(v) => set({ label: v as Form["label"] })}
          items={{
            unreviewed: t("languages.labelOptions.unreviewed"),
            always: t("languages.labelOptions.always"),
          }}
          disabled={disabled}
        />
      </SettingRow>
    </dl>
  );
}
