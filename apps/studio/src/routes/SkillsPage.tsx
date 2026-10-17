import {
  Banner,
  Button,
  Code,
  Collapsible,
  Empty,
  InlineCopyText,
  LayerCard,
  PageLayout,
  Pagination,
  SectionCard,
  SectionEmpty,
  Table,
  Text,
  Tooltip,
} from "@cloudhal/ui";
import { CodeHighlighted } from "@cloudhal/ui/code";
import { BookOpenText, CaretRight, FolderSimplePlus, Info, Lightbulb } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { Crumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ListToolbar } from "../components/ListToolbar.tsx";
import { ApprovalTool, SkillDetailDialog, SkillScope } from "../components/SkillDetailDialog.tsx";
import { TableSkeleton } from "../components/TableSkeleton.tsx";
import { usePaging } from "../components/usePaging.ts";
import { type TFunction, useT } from "../i18n/index.tsx";
import { api, type SkillSummary } from "../lib/api.ts";
import { matchesSkill, orderSkillScopes, SKILL_META_KEY, skillCallSnippet } from "../lib/skills.ts";

const HOW_STEPS = ["read", "declare", "narrow", "approve"] as const;

/** The mechanism in four steps, with the `_meta` request that does the narrowing. */
function HowSkillsWork() {
  const t = useT();
  return (
    <SectionCard title={t("skills.how.title")} icon={<Lightbulb size={16} />}>
      <div className="grid gap-3">
        {HOW_STEPS.map((step, i) => (
          <div key={step} className="flex items-start gap-3" data-step={step}>
            <span className="flex h-lh shrink-0 items-center">
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
      <Collapsible.Root>
        <Collapsible.DefaultTrigger>{t("skills.how.example")}</Collapsible.DefaultTrigger>
        <Collapsible.DefaultPanel>
          <div className="min-w-0 overflow-x-auto">
            <CodeHighlighted
              code={skillCallSnippet({ name: "safe-edit", approval: [] })}
              lang="json"
              showCopyButton
            />
          </div>
        </Collapsible.DefaultPanel>
      </Collapsible.Root>
    </SectionCard>
  );
}

function AddYourOwn() {
  const t = useT();
  return (
    <SectionCard
      title={t("skills.add.title")}
      icon={<FolderSimplePlus size={16} />}
      description={t("skills.add.description")}
    >
      <Code lang="bash" code={"skills/<name>/SKILL.md\nskills/<name>/references/*.md"} />
    </SectionCard>
  );
}

function referencesLabel(t: TFunction, count: number) {
  if (count === 0) return t("skills.none");
  return t("skills.referenceCount", { count });
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
    <PageLayout
      crumbs={
        <Crumbs
          trail={[
            { label: t("pageHeaders.agents.title"), href: "/agents" },
            { label: t("pageHeaders.skills.title") },
          ]}
        />
      }
      icon={<BookOpenText size={24} />}
      title={t("pageHeaders.skills.title")}
      description={t("pageHeaders.skills.description")}
      aside={
        <>
          <HowSkillsWork />
          <AddYourOwn />
        </>
      }
    >
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
                <Table.Head sticky="right" className="w-12">
                  <span className="sr-only">{t("skills.view")}</span>
                </Table.Head>
              </Table.Row>
            </Table.Header>
            {skills.isPending ? (
              <TableSkeleton columns={5} rows={4} />
            ) : paging.pageItems.length === 0 ? (
              <Table.Body>
                <Table.Row>
                  <Table.Cell colSpan={5}>
                    <SectionEmpty
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
                    className="cursor-pointer"
                  >
                    <Table.Cell className="align-top">
                      <div className="flex min-w-56 max-w-96 flex-col gap-1">
                        <Text bold as="span">
                          {s.name}
                        </Text>
                        <Text variant="secondary" size="sm" as="span">
                          <span className="line-clamp-2">{s.description}</span>
                        </Text>
                        {/* biome-ignore lint/a11y/noStaticElementInteractions: only stops the row click */}
                        {/* biome-ignore lint/a11y/useKeyWithClickEvents: the copy button handles keys itself */}
                        <span className="w-fit pt-0.5" onClick={(e) => e.stopPropagation()}>
                          <InlineCopyText>{s.resource}</InlineCopyText>
                        </span>
                      </div>
                    </Table.Cell>
                    <Table.Cell className="align-top">
                      <div className="flex flex-wrap gap-1">
                        {orderSkillScopes(s.scopes).map((scope) => (
                          <SkillScope key={scope} scope={scope} />
                        ))}
                      </div>
                    </Table.Cell>
                    <Table.Cell className="align-top">
                      {s.approval.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
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
                    <Table.Cell className="whitespace-nowrap align-top">
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
                    <Table.Cell sticky="right" className="w-12 text-right align-top">
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
          controls="simple"
        />
      )}
      <SkillDetailDialog skill={selected} onOpenChange={(o) => !o && setSelected(undefined)} />
    </PageLayout>
  );
}
