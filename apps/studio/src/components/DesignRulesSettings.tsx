/**
 * Site › Settings › Design rules (RFC-0021 §5): the site's DESIGN.md, the Markdown every agent and
 * Build chat reads before building, next to the theme's own rules (read-only). Saved to the site
 * (snapshotted with it); `design_lint` warnings show after loading and saving. Agents propose
 * changes with `set_design`, which waits for a person in Approvals.
 */
import { Banner, Button, Collapsible, InputArea, SkeletonLine, Text } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, api } from "../lib/api.ts";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const DESIGN_RULES_SECTION = "design";

/** The contract's limit (`Site.design.markdown`). */
const MAX = 24_000;

/** The recommended headings (RFC-0021 §1), for an empty start. */
const TEMPLATE = [
  "## Brand",
  "",
  "## Colors",
  "",
  "## Typography",
  "",
  "## Layout",
  "",
  "## Components",
  "",
  "## Imagery",
  "",
  "## Pages",
  "",
  "## Do",
  "",
  "## Don't",
  "",
].join("\n");

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

export function DesignRulesSettingsSection({
  siteId,
  theme,
}: {
  siteId: string;
  /** The site's theme name, for the wording. */
  theme: string;
}) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const key = ["design-rules", siteId] as const;
  const rules = useQuery({ queryKey: key, queryFn: () => api.design.get(siteId) });
  const saved = rules.data;
  const [text, setText] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  useEffect(() => {
    if (saved) {
      setText(saved.site ?? "");
      setWarnings(saved.warnings);
    }
  }, [saved]);
  const save = useMutation({
    mutationFn: (markdown: string) =>
      api.design.save(siteId, { rev: saved?.rev ?? 0, markdown: markdown.trim() || null }),
    onSuccess: async (result) => {
      setWarnings(result.warnings);
      toast.success(t("siteSettings.design.saved"));
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
    },
  });

  const title = t("siteSettings.sections.design");
  if (!saved || text === undefined)
    return (
      <SettingsSection id={DESIGN_RULES_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  const dirty = text.trim() !== (saved.site ?? "").trim();
  const disabled = !gate.allowed;
  const count = (n: number) => n.toLocaleString(locale);
  return (
    <SettingsSection
      id={DESIGN_RULES_SECTION}
      title={title}
      description={t("siteSettings.design.description")}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => setText(saved.site ?? "")}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || text.length > MAX || disabled}
            title={gate.reason}
            loading={save.isPending}
            onClick={() => save.mutate(text)}
          >
            {t("common.saveChanges")}
          </Button>
        </>
      }
    >
      {save.error && (
        <Banner
          variant={isConflict(save.error) ? "alert" : "error"}
          icon={<WarningCircle weight="fill" />}
          title={t("siteSettings.design.failed")}
          description={
            isConflict(save.error)
              ? t("siteSettings.conflictDescription")
              : save.error instanceof Error
                ? save.error.message
                : String(save.error)
          }
        />
      )}
      {warnings.length > 0 && (
        <Banner
          variant="alert"
          icon={<WarningCircle weight="fill" />}
          title={t("siteSettings.design.warnings")}
          description={warnings.join(" ")}
          data-testid="design-warnings"
        />
      )}
      <div className="grid min-w-0 gap-4">
        <InputArea
          className="w-full font-mono"
          label={t("siteSettings.design.label")}
          placeholder={t("siteSettings.design.placeholder")}
          value={text}
          onValueChange={setText}
          disabled={disabled}
          autoResize
          minRows={10}
          maxRows={30}
          description={t("siteSettings.design.count", {
            count: count(text.length),
            max: count(MAX),
          })}
          data-testid="design-rules"
        />
        {!text.trim() && !disabled && (
          <div>
            <Button variant="secondary" onClick={() => setText(TEMPLATE)}>
              {t("siteSettings.design.template")}
            </Button>
          </div>
        )}
        {saved.theme ? (
          <Collapsible.Root>
            <Collapsible.DefaultTrigger>
              {t("siteSettings.design.theme", { theme })}
            </Collapsible.DefaultTrigger>
            <Collapsible.Panel>
              <div className="grid gap-1.5 pt-3">
                <Text variant="secondary" size="sm">
                  {t("siteSettings.design.themeHint")}
                </Text>
                <InputArea
                  aria-label={t("siteSettings.design.theme", { theme })}
                  className="w-full font-mono"
                  value={saved.theme}
                  readOnly
                  autoResize
                  minRows={6}
                  maxRows={20}
                />
              </div>
            </Collapsible.Panel>
          </Collapsible.Root>
        ) : (
          <Text variant="secondary" size="sm">
            {t("siteSettings.design.noTheme", { theme })}
          </Text>
        )}
        <Text variant="secondary" size="sm">
          {disabled && gate.reason ? gate.reason : t("siteSettings.design.agentHint")}
        </Text>
      </div>
    </SettingsSection>
  );
}
