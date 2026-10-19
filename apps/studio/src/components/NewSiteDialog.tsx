import { Banner, Input, LayerDialog, Select } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { COMMON_LOCALES, languageOption } from "../lib/languages.ts";
import { slugify } from "../lib/workflow.ts";
import { useSites } from "./SiteAccessField.tsx";
import { useToast } from "./Toast.ts";

const NEW_PROJECT = "__new";
const BLANK = "__blank";
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A new site in this installation (RFC-0034 §3): name, address slug, language and project. It
 * starts with a home page and system pages, nothing published; Studio opens it afterwards.
 * `projectId` presets the project (the project overview's "New site in this project").
 */
export function NewSiteDialog({
  open,
  onOpenChange,
  projectId,
  from: fromSite,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string | undefined;
  /** RFC-0034 §6: preset "start from this site" (a language edition). */
  from?: string | undefined;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const projects = useQuery({ queryKey: ["projects"], queryFn: api.projects.list, enabled: open });
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [language, setLanguage] = useState("en");
  const [project, setProject] = useState<string>(NEW_PROJECT);
  const [from, setFrom] = useState<string>(BLANK);
  const [submitted, setSubmitted] = useState(false);
  const create = useMutation({
    mutationFn: () =>
      api.sites.create({
        name: name.trim(),
        slug,
        locale: language,
        ...(from !== BLANK ? { from } : project !== NEW_PROJECT ? { projectId: project } : {}),
      }),
    onSuccess: async ({ site, edition }) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["sites"] }),
        qc.invalidateQueries({ queryKey: ["projects"] }),
      ]);
      onOpenChange(false);
      toast.success(
        t("newSite.created"),
        edition
          ? t("newSite.editionCreated", { name: site.name, count: edition.pages })
          : t("newSite.createdDescription", { name: site.name }),
      );
      await navigate({ to: "/sites/$siteId", params: { siteId: site.id } });
    },
  });
  // Every opening starts clean (English by default, the preset project when there is one).
  useEffect(() => {
    if (!open) return;
    setName("");
    setSlug("");
    setSlugEdited(false);
    setLanguage("en");
    setProject(projectId ?? NEW_PROJECT);
    setFrom(fromSite ?? BLANK);
    setSubmitted(false);
    create.reset();
  }, [open, projectId, fromSite]);

  const languages = useMemo(
    () => Object.fromEntries(COMMON_LOCALES.map((l) => [l, languageOption(locale, l)])),
    [locale],
  );
  const nameError = submitted && !name.trim() ? t("newSite.nameRequired") : undefined;
  const slugError = submitted && !SLUG.test(slug) ? t("newSite.slugInvalid") : undefined;
  const submit = () => {
    setSubmitted(true);
    if (create.isPending || !name.trim() || !SLUG.test(slug)) return;
    create.mutate();
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("newSite.title")}</LayerDialog.Title>
        <LayerDialog.Description>{t("newSite.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="new-site">
            {create.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("newSite.failed")}
                description={apiErrorText(t, create.error)}
              />
            )}
            <Input
              className="w-full"
              label={t("newSite.name")}
              value={name}
              onValueChange={(v) => {
                setName(v);
                // "ı" has no decomposition: map it, or "Baskı" would become "bask".
                if (!slugEdited)
                  setSlug(v.trim() ? slugify(v.replace(/ı/g, "i")).slice(0, 100) : "");
              }}
              error={nameError}
              maxLength={200}
              autoFocus
            />
            <Input
              className="w-full"
              label={t("newSite.slug")}
              description={t("newSite.slugHint")}
              value={slug}
              onValueChange={(v) => {
                setSlug(v);
                setSlugEdited(true);
              }}
              error={slugError}
              maxLength={100}
            />
            <Select
              className="w-full"
              label={t("newSite.language")}
              description={t("newSite.languageHint")}
              value={language}
              onValueChange={(v) => setLanguage(v as string)}
              items={languages}
            />
            <OriginFields
              from={from}
              onFrom={setFrom}
              project={project}
              onProject={setProject}
              projects={projects.data ?? []}
            />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit} loading={create.isPending}>
            {t("newSite.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** Where the site starts: blank (in a project of your choice) or as an edition of another site. */
function OriginFields(p: {
  from: string;
  onFrom: (v: string) => void;
  project: string;
  onProject: (v: string) => void;
  projects: readonly { id: string; name: string }[];
}) {
  const { t } = useI18n();
  const sites = useSites().data ?? [];
  const fromItems = {
    [BLANK]: t("newSite.blank"),
    ...Object.fromEntries(sites.map((s) => [s.id, t("newSite.copyOf", { name: s.name })])),
  };
  const projectItems = {
    [NEW_PROJECT]: t("newSite.newProject"),
    ...Object.fromEntries(p.projects.map((x) => [x.id, x.name])),
  };
  return (
    <>
      <Select
        className="w-full"
        label={t("newSite.from")}
        description={p.from === BLANK ? t("newSite.fromHint") : t("newSite.editionHint")}
        value={p.from}
        onValueChange={(v) => p.onFrom(v as string)}
        items={fromItems}
      />
      {p.from === BLANK && (
        <Select
          className="w-full"
          label={t("newSite.project")}
          description={t("newSite.projectHint")}
          value={p.project}
          onValueChange={(v) => p.onProject(v as string)}
          items={projectItems}
        />
      )}
    </>
  );
}
