/** The page's sections: count, the add menu, and one card per section with move and remove. */
import type { Page, Section } from "@cloudhal/core-contracts";
import {
  Badge,
  Button,
  DropdownMenu,
  Empty,
  InlineCopyText,
  SectionCard,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { ArrowDown, ArrowUp, CaretDown, Plus, Rows, Trash } from "@phosphor-icons/react";
import type { ReactNode } from "react";
import { useT } from "../../i18n/index.tsx";
import { blockIcon, newBlockSection } from "../BlockSection.tsx";
import { BodyProposals } from "../BodyProposals.tsx";
import { SectionForm } from "./SectionForm.tsx";
import { KIND_ICON, KINDS, newSection, sectionId, sectionQueryIssues } from "./sections.ts";
import type { PageEditorState } from "./usePageEditor.ts";

export function SectionList({
  ed,
  draft,
  siteId,
  readOnly,
}: {
  ed: PageEditorState;
  draft: Page;
  siteId: string;
  readOnly: boolean;
}) {
  const t = useT();
  const { setDraft, blockTypes, blockTitle } = ed;
  const updateSection = (i: number, s: Section) =>
    setDraft({ ...draft, sections: draft.sections.map((x, j) => (j === i ? s : x)) });
  const move = (i: number, dir: -1 | 1) => {
    const sections = [...draft.sections];
    const j = i + dir;
    if (j < 0 || j >= sections.length) return;
    [sections[i], sections[j]] = [sections[j] as Section, sections[i] as Section];
    setDraft({ ...draft, sections });
  };
  const kindLabel = (k: Section["kind"]) => t(`editor.sectionKinds.${k}`);
  const sectionTitle = (s: Section) =>
    s.kind === "component" ? blockTitle(s.type) : kindLabel(s.kind);
  const sectionIcon = (s: Section) =>
    s.kind === "component"
      ? blockIcon(blockTypes.find((b) => b.name === s.type))
      : KIND_ICON[s.kind];
  const addMenu = <AddSectionMenu ed={ed} draft={draft} />;
  const iconButton = (label: string, icon: ReactNode, onClick: () => void, disabled = false) => (
    <Tooltip
      content={label}
      render={
        <Button
          variant="ghost"
          size="sm"
          shape="square"
          icon={icon}
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
        />
      }
    />
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Text variant="heading" as="h2">
            {t("editor.sections")}
          </Text>
          <Badge variant="secondary">{draft.sections.length}</Badge>
        </span>
        {draft.sections.length > 0 && addMenu}
      </div>
      {draft.sections.length === 0 ? (
        <Empty
          icon={<Rows size={48} className="text-kumo-inactive" />}
          title={t("editor.noSections")}
          description={t("editor.noSectionsDescription")}
          contents={addMenu}
        />
      ) : (
        draft.sections.map((s, i) => {
          const KindIcon = sectionIcon(s);
          return (
            <SectionCard
              key={s.id}
              as="h3"
              title={sectionTitle(s)}
              icon={<KindIcon size={16} />}
              actions={
                <>
                  <span className="hidden sm:inline-flex">
                    <InlineCopyText>{s.id}</InlineCopyText>
                  </span>
                  <span className="flex items-center gap-1">
                    {iconButton(t("editor.moveUp"), <ArrowUp />, () => move(i, -1), i === 0)}
                    {iconButton(
                      t("editor.moveDown"),
                      <ArrowDown />,
                      () => move(i, 1),
                      i === draft.sections.length - 1,
                    )}
                    {iconButton(t("editor.remove"), <Trash />, () => ed.setRemoveIndex(i))}
                  </span>
                </>
              }
            >
              <SectionForm
                section={s}
                onChange={(next) => updateSection(i, next)}
                media={{
                  siteId,
                  defaultLocale: ed.site.data?.defaultLocale ?? draft.locale,
                  host: ed.host,
                  nodeId: draft.id,
                  locale: draft.locale,
                }}
                blocks={blockTypes}
                readOnly={readOnly}
                queryIssues={sectionQueryIssues(ed.save.error, i)}
              />
              {s.kind === "richText" && s.format === "markdown" && (
                <BodyProposals
                  siteId={siteId}
                  nodeId={draft.id}
                  sectionId={s.id}
                  dirty={ed.dirty}
                  readOnly={readOnly}
                  onDecided={() => ed.query.refetch()}
                />
              )}
            </SectionCard>
          );
        })
      )}
    </div>
  );
}

/** The built-in section kinds, then the theme's section block types (RFC-0015). */
function AddSectionMenu({ ed, draft }: { ed: PageEditorState; draft: Page }) {
  const t = useT();
  const { setDraft, blockTypes, blockTitle } = ed;
  const sectionBlocks = blockTypes.filter((b) => b.where.includes("section"));
  return (
    <DropdownMenu>
      <DropdownMenu.Trigger render={<Button variant="secondary" icon={<Plus />} />}>
        {t("editor.addSection")}
        <CaretDown size={12} aria-hidden />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end">
        {KINDS.map((k) => (
          <DropdownMenu.Item
            key={k}
            icon={KIND_ICON[k]}
            onClick={() =>
              setDraft({
                ...draft,
                sections: [...draft.sections, newSection(k, t("editor.heading"))],
              })
            }
          >
            {t(`editor.sectionKinds.${k}`)}
          </DropdownMenu.Item>
        ))}
        {sectionBlocks.length > 0 && (
          <>
            <DropdownMenu.Separator />
            <DropdownMenu.Group>
              <DropdownMenu.Label>{t("editor.blocks.menu")}</DropdownMenu.Label>
              {sectionBlocks.map((b) => {
                const BlockIcon = blockIcon(b);
                return (
                  <DropdownMenu.Item
                    key={b.name}
                    icon={BlockIcon}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sections: [...draft.sections, newBlockSection(sectionId(), b)],
                      })
                    }
                  >
                    {blockTitle(b.name)}
                  </DropdownMenu.Item>
                );
              })}
            </DropdownMenu.Group>
          </>
        )}
      </DropdownMenu.Content>
    </DropdownMenu>
  );
}
