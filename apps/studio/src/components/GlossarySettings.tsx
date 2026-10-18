/**
 * Site › Settings › Glossary (RFC-0033 §2): the terms agents keep when they translate — names
 * never translated, and the approved word in each of the site's other languages. Agents read it
 * through `get_translation_source`; the checks flag drafts that break it. Saved as one node (CAS
 * on `rev`), snapshotted with the site.
 */
import type { Glossary } from "@cloudhal/core-contracts";
import {
  Banner,
  Button,
  Checkbox,
  Input,
  SectionEmpty,
  SkeletonLine,
  Table,
  Text,
} from "@cloudhal/ui";
import { BookOpenText, Plus, WarningCircle, X } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { languageName } from "../lib/languages.ts";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const GLOSSARY_SETTINGS_SECTION = "glossary";

type Entry = Glossary["entries"][number];

/** An entry without empty translations (the contract wants text in every one it lists). */
function clean(e: Entry): Entry {
  const translations = Object.fromEntries(
    Object.entries(e.translations ?? {}).filter(([, v]) => v?.text.trim()),
  );
  const { translations: _t, ...rest } = e;
  return {
    ...rest,
    term: e.term.trim(),
    ...(!e.doNotTranslate && Object.keys(translations).length ? { translations } : {}),
  };
}

export function GlossarySettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const key = ["glossary", siteId] as const;
  const glossary = useQuery({ queryKey: key, queryFn: () => api.translations.glossary(siteId) });
  const [entries, setEntries] = useState<Entry[] | undefined>();
  useEffect(() => {
    if (glossary.data) setEntries(glossary.data.entries);
  }, [glossary.data]);
  const save = useMutation({
    mutationFn: (list: Entry[]) =>
      api.translations.saveGlossary(siteId, {
        ...("rev" in (glossary.data ?? {})
          ? { id: (glossary.data as Glossary).id, rev: (glossary.data as Glossary).rev }
          : {}),
        entries: list.map(clean).filter((e) => e.term),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(key, saved);
      toast.success(t("glossary.saved"));
    },
  });
  const title = t("glossary.title");
  if (!site.data || !entries)
    return (
      <SettingsSection id={GLOSSARY_SETTINGS_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  const others = site.data.locales.filter((l) => l !== site.data?.defaultLocale);
  const name = (l: string) => languageName(locale, l);
  const dirty = JSON.stringify(entries) !== JSON.stringify(glossary.data?.entries ?? []);
  const disabled = !gate.allowed;
  const update = (i: number, e: Entry) => setEntries(entries.map((x, j) => (j === i ? e : x)));
  return (
    <SettingsSection
      id={GLOSSARY_SETTINGS_SECTION}
      title={title}
      description={t("glossary.description")}
      footer={
        <>
          <Button
            variant="ghost"
            icon={<Plus />}
            disabled={disabled}
            onClick={() => setEntries([...entries, { term: "" }])}
          >
            {t("glossary.add")}
          </Button>
          <Button
            variant="primary"
            disabled={!dirty || disabled}
            title={gate.reason}
            loading={save.isPending}
            onClick={() => save.mutate(entries)}
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
          title={t("glossary.failed")}
          description={apiErrorText(t, save.error)}
        />
      )}
      {others.length === 0 && (
        <Text variant="secondary" size="sm">
          {t("glossary.oneLanguage")}
        </Text>
      )}
      {entries.length === 0 ? (
        <SectionEmpty
          icon={<BookOpenText size={32} className="text-kumo-inactive" />}
          title={t("glossary.empty")}
          description={t("glossary.emptyDescription")}
        />
      ) : (
        <Table>
          <Table.Header>
            <Table.Row>
              <Table.Head>{t("glossary.term")}</Table.Head>
              <Table.Head>{t("glossary.neverTranslate")}</Table.Head>
              {others.map((l) => (
                <Table.Head key={l}>{name(l)}</Table.Head>
              ))}
              <Table.Head sticky="right" />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {entries.map((e, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place; terms change as people type
              <Table.Row key={i} data-term={e.term}>
                <Table.Cell>
                  <Input
                    aria-label={t("glossary.term")}
                    value={e.term}
                    onValueChange={(v) => update(i, { ...e, term: v })}
                    disabled={disabled}
                  />
                </Table.Cell>
                <Table.Cell>
                  <Checkbox
                    aria-label={t("glossary.neverTranslate")}
                    checked={e.doNotTranslate === true}
                    disabled={disabled}
                    onCheckedChange={(on) => {
                      const { doNotTranslate: _d, ...rest } = e;
                      update(i, on === true ? { ...rest, doNotTranslate: true } : rest);
                    }}
                  />
                </Table.Cell>
                {others.map((l) => (
                  <Table.Cell key={l}>
                    <Input
                      aria-label={t("glossary.translationIn", { language: name(l) })}
                      value={e.translations?.[l]?.text ?? ""}
                      disabled={disabled || e.doNotTranslate === true}
                      onValueChange={(v) =>
                        update(i, { ...e, translations: { ...e.translations, [l]: { text: v } } })
                      }
                    />
                  </Table.Cell>
                ))}
                <Table.Cell sticky="right" className="text-end">
                  <Button
                    variant="ghost"
                    shape="square"
                    icon={<X />}
                    aria-label={t("glossary.remove", { term: e.term || "…" })}
                    disabled={disabled}
                    onClick={() => setEntries(entries.filter((_, j) => j !== i))}
                  />
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table>
      )}
    </SettingsSection>
  );
}
