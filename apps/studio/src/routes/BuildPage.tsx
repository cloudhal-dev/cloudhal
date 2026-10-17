/**
 * Build view (RFC-0020 §6, phase 20b): a page as agents build it. The activity feed shows every
 * applied change, Cloudhal's repairs and the refused operations an agent fixes; the preview
 * merges each new version in place (scroll and open tabs survive) and outlines what changed.
 * "Pick" aims Build chat at one section or element: the preview outlines what is under the pointer
 * and a click scopes the next briefs to it. Agents change the draft through MCP or Build chat,
 * people in the page editor.
 */
import type { Page } from "@cloudhal/core-contracts";
import {
  Badge,
  BuildActivity,
  type BuildActivityItem,
  Button,
  InlineCopyText,
  LinkButton,
  PageLayout,
  PreviewPanel,
  type PreviewTarget,
  SectionCard,
  Text,
} from "@cloudhal/ui";
import { ArrowLeft, Plug, Pulse, Target } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useParams, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BuildChat, type BuildScope } from "../components/BuildChat.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { EditorLayout } from "../components/EditorLayout.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { type TFunction, useT } from "../i18n/index.tsx";
import { api, mcpEndpoint } from "../lib/api.ts";
import { type BuildEntry, useBuildEvents } from "../lib/build.ts";

/** The words for a picked part, or undefined when the page no longer has it. */
function scopeOf(
  page: Page | undefined,
  target: PreviewTarget,
  t: TFunction<"build">,
): BuildScope | undefined {
  const index = page ? page.sections.findIndex((s) => s.id === target.sectionId) : -1;
  const section = page?.sections[index];
  if (!section) return undefined;
  if (!target.componentId)
    return { ...target, label: t("build.chat.scopeSection", { index: index + 1 }) };
  const component =
    section.kind === "surface"
      ? section.components.find((c) => c.id === target.componentId)
      : undefined;
  if (!component) return undefined;
  return {
    ...target,
    label: t("build.chat.scopeComponent", {
      component: component.component,
      id: component.id,
      index: index + 1,
    }),
  };
}

export function BuildPage() {
  const { siteId, pageId } = useParams({ from: "/sites/$siteId/pages/$pageId/build" });
  const t = useT("build");
  const tc = useT();
  const build = useBuildEvents(siteId, pageId);
  const editorHref = `/sites/${siteId}/pages/${pageId}`;
  const title = build.title ?? "";
  // Click-to-scope (RFC-0020 §6): the picked part, named from the page as it is now.
  const [picking, setPicking] = useState(false);
  // Opened from the editor's "Change with AI": aimed at that part from the start.
  const search = useSearch({ from: "/sites/$siteId/pages/$pageId/build" });
  const [target, setTarget] = useState<PreviewTarget | undefined>(() =>
    search.section
      ? {
          sectionId: search.section,
          ...(search.component ? { componentId: search.component } : {}),
        }
      : undefined,
  );
  const page = useQuery({
    queryKey: ["page", siteId, pageId, build.rev],
    queryFn: () => api.pages.get(siteId, pageId),
    enabled: target !== undefined,
  });
  const scope = target ? scopeOf(page.data, target, t) : undefined;
  // A part a later version removed is no longer a scope.
  useEffect(() => {
    if (target && page.data && !scopeOf(page.data, target, t)) setTarget(undefined);
  }, [page.data, target, t]);

  const summary = (e: BuildEntry): Pick<BuildActivityItem, "summary" | "details"> => {
    if (e.kind === "rejected")
      return {
        summary: t("build.activity.refused", { count: e.issues.length }),
        details: e.issues,
      };
    const changed =
      e.changed.length === 0
        ? t("build.activity.unchanged")
        : t("build.activity.changed", { count: e.changed.length });
    const ops = e.ops ? ` · ${t("build.activity.operations", { count: e.ops })}` : "";
    return {
      summary: `${changed}${ops}`,
      details: e.repairs.map((text) => t("build.activity.repair", { text })),
    };
  };
  const items: BuildActivityItem[] = build.entries.map((e) => ({
    id: e.id,
    kind: e.kind,
    actor: e.actor,
    tool: e.tool,
    at: e.at,
    ...summary(e),
  }));

  return (
    <PageLayout
      crumbs={
        <SiteCrumbs
          siteId={siteId}
          trail={[
            { label: tc("pageHeaders.pages.title"), href: `/sites/${siteId}/pages` },
            { label: title || undefined, href: editorHref },
            { label: t("build.preview") },
          ]}
          copy={pageId}
        />
      }
      title={title ? t("build.title", { title }) : undefined}
      description={t("build.description")}
      loading={build.html === undefined && build.status === "connecting"}
      actions={
        <>
          <Badge
            variant={build.status === "live" ? "success" : "warning"}
            appearance="dot"
            data-testid="build-status"
          >
            {t(`build.connection.${build.status}`)}
          </Badge>
          <LinkButton href={editorHref} variant="secondary" icon={ArrowLeft}>
            {t("build.backToEditor")}
          </LinkButton>
        </>
      }
    >
      <EditorLayout
        previewVisible
        preview={
          <PreviewPanel
            src={api.preview.page(siteId, pageId)}
            live
            morph
            srcDoc={build.html}
            highlight={build.highlight}
            version={build.rev}
            fill
            status={
              <Button
                size="sm"
                variant={picking ? "primary" : "secondary"}
                icon={<Target />}
                aria-pressed={picking}
                title={t("build.chat.pickHint")}
                onClick={() => setPicking((p) => !p)}
                data-testid="build-pick"
              >
                {picking ? t("build.chat.picking") : t("build.chat.pick")}
              </Button>
            }
            pick={{
              active: picking,
              selected: scope ? target : undefined,
              onPick: (next) => {
                setTarget(next);
                setPicking(false);
              },
              onCancel: () => setPicking(false),
              label: t("build.chat.pickLabel"),
            }}
            labels={{
              title: t("build.preview"),
              frameTitle: tc("preview.frameTitle", { name: title }),
              device: tc("preview.device"),
              desktop: tc("preview.desktop"),
              tablet: tc("preview.tablet"),
              mobile: tc("preview.mobile"),
              reload: tc("preview.reload"),
              openInNewTab: tc("preview.openSaved"),
              loading: tc("preview.loading"),
            }}
          />
        }
        main={
          <>
            <BuildChat
              siteId={siteId}
              pageId={pageId}
              scope={scope}
              onClearScope={() => setTarget(undefined)}
            />
            <SectionCard title={t("build.activity.title")} icon={<Pulse />}>
              <BuildActivity
                items={items}
                labels={{
                  empty: t("build.activity.empty"),
                  emptyDescription: t("build.activity.emptyDescription"),
                  applied: t("build.activity.applied"),
                  rejected: t("build.activity.rejected"),
                }}
                renderTime={(iso) => <RelativeTime iso={iso} />}
              />
            </SectionCard>
          </>
        }
        aside={
          <SectionCard
            title={t("build.connect.title")}
            icon={<Plug />}
            description={t("build.connect.description")}
          >
            <div className="grid gap-6">
              <div className="grid gap-1.5">
                <Text bold>{t("build.connect.endpoint")}</Text>
                <InlineCopyText>{mcpEndpoint(window.location.origin)}</InlineCopyText>
              </div>
              <div className="grid gap-1.5">
                <Text bold>{t("build.connect.pageId")}</Text>
                <InlineCopyText>{pageId}</InlineCopyText>
              </div>
              <div className="grid gap-1.5">
                <Text bold>{t("build.connect.steps")}</Text>
                {(["step1", "step2", "step3"] as const).map((step, i) => (
                  <Text key={step}>{`${i + 1}. ${t(`build.connect.${step}`)}`}</Text>
                ))}
              </div>
            </div>
          </SectionCard>
        }
      />
    </PageLayout>
  );
}
