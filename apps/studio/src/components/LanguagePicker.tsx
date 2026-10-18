/**
 * Adding a site language (RFC-0033 §8): a searchable list of common languages, each by its name in
 * the Studio language, its own name and its BCP 47 tag; a valid tag that is not listed can be
 * typed and used. Languages the site already has are left out.
 */
import { collator } from "@cloudhal/messages/format";
import { Combobox } from "@cloudhal/ui";
import { useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { COMMON_LOCALES, languageOption } from "../lib/languages.ts";

/** The contract's locale pattern (`common.schema.json#/$defs/Locale`). */
const LOCALE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

interface Option {
  tag: string;
  label: string;
}

export function LanguagePicker({
  taken,
  onPick,
  disabled,
}: {
  taken: readonly string[];
  onPick: (tag: string) => void;
  disabled: boolean;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState("");
  const options = useMemo(() => {
    const order = collator(locale);
    const list = COMMON_LOCALES.filter((l) => !taken.includes(l))
      .map((tag) => ({ tag, label: languageOption(locale, tag) }))
      .sort((a, b) => order.compare(a.label, b.label));
    const typed = query.trim();
    const custom =
      LOCALE.test(typed) && !taken.includes(typed) && !COMMON_LOCALES.includes(typed)
        ? [{ tag: typed, label: t("languages.useTag", { tag: typed }) }]
        : [];
    return [...custom, ...list];
  }, [locale, taken, query, t]);
  return (
    <Combobox
      items={options}
      value={null}
      onValueChange={(v) => {
        const picked = v as Option | null;
        if (!picked) return;
        onPick(picked.tag);
        setQuery("");
      }}
      inputValue={query}
      onInputValueChange={(v: string) => setQuery(v)}
      isItemEqualToValue={(a: Option, b: Option) => a.tag === b.tag}
      itemToStringLabel={(o: Option) => o.label}
      label={t("languages.add")}
      description={t("languages.addHint")}
      disabled={disabled}
    >
      <Combobox.TriggerInput
        placeholder={t("languages.addPlaceholder")}
        clearLabel={t("languages.clear")}
        showOptionsLabel={t("languages.showOptions")}
      />
      <Combobox.Content>
        <Combobox.Empty>{t("languages.noMatch")}</Combobox.Empty>
        <Combobox.List>
          {(o: Option) => (
            <Combobox.Item key={o.tag} value={o}>
              {o.label}
            </Combobox.Item>
          )}
        </Combobox.List>
      </Combobox.Content>
    </Combobox>
  );
}
