import {
  Banner,
  Button,
  Code,
  Empty,
  InlineCopyText,
  LayerCard,
  Pagination,
  ResourceListPage,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { BookOpenText, CaretRight, FolderSimplePlus, Info, Lightbulb } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { ApprovalTool, SkillDetailDialog, SkillScope } from "../components/SkillDetailDialog.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { useT } from "../i18n/index.tsx";
import { api, type SkillSummary } from "../lib/api.ts";
import { matchesSkill, orderSkillScopes, SKILL_META_KEY, skillCallSnippet } from "../lib/skills.ts";

const HOW_STEPS = ["read", "declare", "narrow", "approve"] as const;

/** The mechanism in four steps, with the `_meta` request that does the narrowing. */
function HowSkillsWork() {
  const t = useT();
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2 px-5 py-3">
        <Lightbulb size={16} className="text-kumo-subtle" />
        <Text variant="heading" as="h2">
          {t("skills.how.title")}
        </Text>
      </LayerCard.Secondary>
      <LayerCard.Primary className="grid min-w-0 gap-4 px-5 py-4">
        <div className="grid gap-3">
          {HOW_STEPS.map((step, i) => (
            <div key={step} className="flex items-start gap-3" data-step={step}>
              <span className="flex h-lh items-center">
                <span
                  aria-hidden
                  className="flex size-5 items-center justify-center rounded-full bg-kumo-tint text-kumo-subtle text-xs tabular-nums ring ring-kumo-hairline"
                >
                  {i + 1}
                </span>
              </span>
              <Text as="span">
                {t(`skills.how.steps.${step}`)}
                {step === "declare" && (
                  <>
                    {" "}
                    <span className="font-mono text-[0.9em]">{`_meta["${SKILL_META_KEY}"]`}</span>
                  </>
                )}
              </Text>
            </div>
          ))}
        </div>
        <div className="grid min-w-0 gap-2">
          <Text size="sm" bold as="span">
            {t("skills.how.example")}
          </Text>
          <div className="min-w-0 overflow-x-auto">
            <CodeHighlighted
              code={skillCallSnippet({ name: "safe-edit", approval: [] })}
              lang="json"
              showCopyButton
            />
          </div>
        </div>
      </LayerCard.Primary>
    </LayerCard>
  );
}

function AddYourOwn() {
  const t = useT();
  return (
    <LayerCard>
      <LayerCard.Secondary className="flex items-center gap-2 px-5 py-3">
        <FolderSimplePlus size={16} className="text-kumo-subtle" />
        <Text variant="heading" as="h2">
          {t("skills.add.title")}
        </Text>
      </LayerCard.Secondary>
      <LayerCard.Primary className="grid min-w-0 gap-3 px-5 py-4">
        <Text variant="secondary">{t("skills.add.description")}</Text>
        <Code lang="bash" code={"skills/<name>/SKILL.md\nskills/<name>/references/*.md"} />
      </LayerCard.Primary>
    </LayerCard>
  );
}

function referencesLabel(t: ReturnType<typeof useT>, count: number) {
  if (count === 0) return t("skills.none");
  return count === 1 ? t("skills.referenceOne") : t("skills.referenceCount", { count });
}

/** Account surface › Agents › Skills (DESIGN.md §2a list, §2l). */
export function SkillsPage() {
  const t = useT();
  const skills = useQuery({ queryKey: ["skills"], queryFn: api.skills.list });
  const instance = useQuery({ queryKey: ["instance"], queryFn: api.instance });
  const matches = useCallback(matchesSkill, []);
  const paging = usePaging(skills.data, matches);
  const [selected, setSelected] = useState<SkillSummary | undefined>();
  const noMcp = instance.data?.features.mcp === false;

  return (
    <ResourceListPage
      title={t("skills.title")}
      description={t("skills.description")}
      icon={<BookOpenText size={32} className="text-kumo-subtle" />}
      usage={<HowSkillsWork />}
      additionalContent={<AddYourOwn />}
    >
      <div className="grid gap-4">
        {noMcp && (
          <Banner
            variant="secondary"
            icon={<Info weight="fill" />}
            title={t("skills.notEnabledTitle")}
            description={t("skills.notEnabledDescription")}
          />
        )}
        <ErrorBanner
          error={skills.error}
          onRetry={() => skills.refetch()}
          retrying={skills.isFetching}
        />
        <ListToolbar
          search={paging.search}
          onSearch={paging.setSearch}
          placeholder={t("skills.search")}
        />
        {skills.data?.length === 0 ? (
          <Empty
            icon={<BookOpenText size={48} className="text-kumo-inactive" />}
            title={t("skills.empty")}
            description={t("skills.emptyDescription")}
            commandLine="mkdir -p skills/my-skill && $EDITOR skills/my-skill/SKILL.md"
          />
        ) : (
          <LayerCard className="overflow-x-auto p-0">
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.Head>{t("skills.columns.skill")}</Table.Head>
                  <Table.Head>{t("skills.columns.scopes")}</Table.Head>
                  <Table.Head>{t("skills.columns.approval")}</Table.Head>
                  <Table.Head>{t("skills.columns.references")}</Table.Head>
                  <Table.Head>{t("skills.columns.resource")}</Table.Head>
                  <Table.Head sticky="right" />
                </Table.Row>
              </Table.Header>
              {skills.isPending ? (
                <TableSkeleton columns={6} rows={4} />
              ) : paging.pageItems.length === 0 ? (
                <Table.Body>
                  <Table.Row>
                    <Table.Cell colSpan={6}>
                      <Empty
                        size="sm"
                        icon={<BookOpenText size={32} className="text-kumo-inactive" />}
                        title={t("skills.noMatches", { query: paging.search })}
                      />
                    </Table.Cell>
                  </Table.Row>
                </Table.Body>
              ) : (
                <Table.Body>
                  {paging.pageItems.map((s) => (
                    // Pointer users click the row; the trailing button is the keyboard path.
                    <Table.Row
                      key={s.name}
                      data-skill={s.name}
                      onClick={() => setSelected(s)}
                      className="cursor-pointer hover:bg-kumo-tint"
                    >
                      <Table.Cell className="min-w-64 max-w-md">
                        <div className="grid gap-0.5">
                          <Text bold as="span">
                            {s.name}
                          </Text>
                          <Text variant="secondary" size="sm" as="span">
                            {s.description}
                          </Text>
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        <div className="flex min-w-48 flex-wrap gap-1">
                          {orderSkillScopes(s.scopes).map((scope) => (
                            <SkillScope key={scope} scope={scope} />
                          ))}
                        </div>
                      </Table.Cell>
                      <Table.Cell>
                        {s.approval.length > 0 ? (
                          <div className="flex min-w-36 flex-wrap gap-1">
                            {s.approval.map((tool) => (
                              <ApprovalTool key={tool} tool={tool} />
                            ))}
                          </div>
                        ) : (
                          <Text variant="secondary" as="span">
                            {t("skills.none")}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        {s.references.length > 0 ? (
                          <Tooltip content={s.references.join(", ")}>
                            <Text as="span">{referencesLabel(t, s.references.length)}</Text>
                          </Tooltip>
                        ) : (
                          <Text variant="secondary" as="span">
                            {t("skills.none")}
                          </Text>
                        )}
                      </Table.Cell>
                      <Table.Cell className="whitespace-nowrap">
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops the row click */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the copy button handles keys itself */}
                        <span onClick={(e) => e.stopPropagation()}>
                          <InlineCopyText>{s.resource}</InlineCopyText>
                        </span>
                      </Table.Cell>
                      <Table.Cell sticky="right" className="text-right">
                        <Button
                          variant="ghost"
                          size="xs"
                          shape="square"
                          icon={<CaretRight />}
                          aria-label={`${t("skills.view")}: ${s.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(s);
                          }}
                        />
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              )}
            </Table>
          </LayerCard>
        )}
        {paging.total > paging.perPage && (
          <Pagination
            page={paging.page}
            perPage={paging.perPage}
            totalCount={paging.total}
            setPage={paging.setPage}
          />
        )}
      </div>
      <SkillDetailDialog skill={selected} onOpenChange={(o) => !o && setSelected(undefined)} />
    </ResourceListPage>
  );
}
