/**
 * Build view (RFC-0020 §6, phase 20b): a page as agents build it. The activity feed shows every
 * applied change, Cloudhal's repairs and the refused operations an agent fixes; the preview
 * merges each new version in place (scroll and open tabs survive) and outlines what changed.
 * Read-only: agents change the draft through MCP, people in the page editor.
 */
import {
  Badge,
  BuildActivity,
  type BuildActivityItem,
  InlineCopyText,
  LinkButton,
  PageLayout,
  PreviewPanel,
  SectionCard,
  Text,
} from "@cloudhal/ui";
import { ArrowLeft, Plug, Pulse } from "@phosphor-icons/react";
import { useParams } from "@tanstack/react-router";
import { BuildChat } from "../components/BuildChat.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { EditorLayout } from "../components/EditorLayout.tsx";
import { RelativeTime } from "../components/RelativeTime.tsx";
import { useT } from "../i18n/index.tsx";
import { api, mcpEndpoint } from "../lib/api.ts";
import { type BuildEntry, useBuildEvents } from "../lib/build.ts";

export function BuildPage() {
  const { siteId, pageId } = useParams({ from: "/sites/$siteId/pages/$pageId/build" });
  const t = useT("build");
  const tc = useT();
  const build = useBuildEvents(siteId, pageId);
  const editorHref = `/sites/${siteId}/pages/${pageId}`;
  const title = build.title ?? "";

  const summary = (e: BuildEntry): Pick<BuildActivityItem, "summary" | "details"> => {
    if (e.kind === "rejected")
      return {
        summary:
          e.issues.length === 1
            ? t("build.activity.refusedOne")
            : t("build.activity.refused", { count: e.issues.length }),
        details: e.issues,
      };
    const changed =
      e.changed.length === 0
        ? t("build.activity.unchanged")
        : e.changed.length === 1
          ? t("build.activity.changedOne")
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
            <BuildChat siteId={siteId} pageId={pageId} />
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
