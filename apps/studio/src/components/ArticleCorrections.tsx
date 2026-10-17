import type { ContentEntry, Correction } from "@cloudhal/core-contracts";
import { formatDate } from "@cloudhal/messages/format";
import {
  Button,
  type CorrectionKind,
  CorrectionList,
  InputArea,
  SectionCard,
  SectionEmpty,
  Select,
  Text,
} from "@cloudhal/ui";
import { Megaphone, Plus } from "@phosphor-icons/react";
import { useState } from "react";
import { useI18n } from "../i18n/index.tsx";

const KINDS: readonly CorrectionKind[] = ["correction", "clarification", "update"];

/** A correction in the form: saved ones carry the store's id and time, new ones only kind and note. */
type DraftCorrection = Pick<Correction, "kind" | "note"> & Partial<Correction>;

/**
 * The article editor's "Corrections" card (RFC-0019 §2, DESIGN.md §2ad), for published articles:
 * the list, newest first (`CorrectionList`), and a form that appends one to the draft. The store
 * stamps its time on save; a new one can be taken out until then.
 */
export function ArticleCorrectionsCard({
  entry,
  onChange,
  disabled,
}: {
  entry: ContentEntry;
  onChange: (next: ContentEntry) => void;
  disabled?: boolean;
}) {
  const { t, locale } = useI18n();
  const [kind, setKind] = useState<CorrectionKind>("correction");
  const [note, setNote] = useState("");
  if (!entry.publishedAt) return null;
  const all = (entry.corrections ?? []) as DraftCorrection[];
  const when = (at: string) => formatDate(locale, at, { dateStyle: "medium", timeStyle: "short" });
  const items = all
    .map((c, index) => ({ c, index }))
    .sort(
      (a, b) => (b.c.at ? Date.parse(b.c.at) : Infinity) - (a.c.at ? Date.parse(a.c.at) : Infinity),
    )
    .map(({ c, index }) => ({
      key: c.id ?? `new-${index}`,
      kind: c.kind,
      note: c.note,
      when: c.at ? when(c.at) : undefined,
      removable: !c.id,
    }));
  const pending = all.some((c) => !c.id);
  const write = (next: DraftCorrection[]) =>
    onChange({ ...entry, corrections: next as Correction[] });
  const add = () => {
    const text = note.trim();
    if (!text) return;
    write([...all, { kind, note: text }]);
    setNote("");
  };
  return (
    <SectionCard
      title={t("articleCorrections.title")}
      icon={<Megaphone size={16} />}
      description={t("articleCorrections.description")}
      data-testid="article-corrections-card"
    >
      {items.length > 0 ? (
        <CorrectionList
          items={items}
          labels={{
            list: t("articleCorrections.title"),
            kinds: {
              correction: t("articleCorrections.kinds.correction"),
              clarification: t("articleCorrections.kinds.clarification"),
              update: t("articleCorrections.kinds.update"),
            },
            unsaved: t("articleCorrections.unsaved"),
            remove: t("articleCorrections.remove"),
          }}
          onRemove={(key) => write(all.filter((c, i) => (c.id ?? `new-${i}`) !== key))}
          disabled={disabled}
        />
      ) : (
        <SectionEmpty
          icon={<Megaphone size={32} className="text-kumo-inactive" />}
          title={t("articleCorrections.empty")}
          description={t("articleCorrections.emptyDescription")}
        />
      )}
      {pending && (
        <Text variant="secondary" size="sm">
          {t("articleCorrections.pending")}
        </Text>
      )}
      <div className="grid gap-3">
        <Select
          className="w-56 max-w-full"
          label={t("articleCorrections.kind")}
          value={kind}
          onValueChange={(v) => setKind(v as CorrectionKind)}
          items={Object.fromEntries(KINDS.map((k) => [k, t(`articleCorrections.kinds.${k}`)]))}
        />
        <InputArea
          label={t("articleCorrections.note")}
          description={t("articleCorrections.noteHint")}
          value={note}
          onValueChange={setNote}
          maxLength={2000}
          autoResize
          minRows={2}
          maxRows={6}
          className="w-full"
        />
        <div>
          <Button variant="secondary" icon={<Plus />} onClick={add} disabled={!note.trim()}>
            {t("articleCorrections.add")}
          </Button>
        </div>
      </div>
    </SectionCard>
  );
}
