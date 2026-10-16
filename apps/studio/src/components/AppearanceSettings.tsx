/**
 * Site › Settings › Appearance (RFC-0017 §1, DESIGN.md §2ab): the theme's design settings —
 * colors, type, corners — as the form generated from its schema (`src/settings.ts`), checked as
 * they are typed by the same interpreter the store runs (contrast rules included). Below it, the
 * color roles the site gets (RFC-0023), light and dark, worked out live by the renderer's own
 * expansion. They are saved to the site and show on it after a publish, like every other change.
 */

import { validateProps } from "@cloudhal/core-ts/blocks";
import { COLOR_ROLES, siteColorTokens } from "@cloudhal/core-ts/tokens";
import { Banner, BlockPropsForm, Button, ColorRolePreview, SkeletonLine, Text } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, api } from "../lib/api.ts";
import { useBlockEnumLabel } from "./BlockSection.tsx";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const APPEARANCE_SETTINGS_SECTION = "appearance";

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

export function AppearanceSettingsSection({ siteId }: { siteId: string }) {
  const { t, locale } = useI18n();
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const enumLabel = useBlockEnumLabel();
  const key = ["theme-settings", siteId] as const;
  const settings = useQuery({ queryKey: key, queryFn: () => api.themeSettings.get(siteId) });
  const saved = settings.data;
  const [values, setValues] = useState<Record<string, unknown> | undefined>();
  useEffect(() => {
    if (saved) setValues(saved.values);
  }, [saved]);
  const issues = useMemo(
    () => (saved?.schema && values ? validateProps(saved.schema, values) : []),
    [saved, values],
  );
  const colors = useMemo(() => {
    const props = saved?.schema?.properties as Record<string, { default?: unknown }> | undefined;
    if (!props || !values || !("seed" in props || "brand" in props)) return undefined;
    return siteColorTokens(values, props);
  }, [saved, values]);
  const save = useMutation({
    mutationFn: (v: Record<string, unknown>) =>
      api.themeSettings.save(siteId, { rev: saved?.rev ?? 0, values: v }),
    onSuccess: async () => {
      toast.success(t("siteSettings.appearance.saved"));
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
    },
  });

  const title = t("siteSettings.sections.appearance");
  if (!saved || !values)
    return (
      <SettingsSection id={APPEARANCE_SETTINGS_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  if (!saved.schema)
    return (
      <SettingsSection
        id={APPEARANCE_SETTINGS_SECTION}
        title={title}
        description={t("siteSettings.appearance.none", { theme: saved.theme })}
      />
    );
  const dirty = JSON.stringify(values) !== JSON.stringify(saved.values);
  const disabled = !gate.allowed;
  return (
    <SettingsSection
      id={APPEARANCE_SETTINGS_SECTION}
      title={title}
      description={t("siteSettings.appearance.description", { theme: saved.theme })}
      footer={
        <>
          {dirty && (
            <Button variant="ghost" onClick={() => setValues(saved.values)}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || issues.length > 0 || disabled}
            title={gate.reason}
            loading={save.isPending}
            onClick={() => save.mutate(values)}
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
          title={t("siteSettings.appearance.failed")}
          description={
            isConflict(save.error)
              ? t("siteSettings.conflictDescription")
              : save.error instanceof Error
                ? save.error.message
                : String(save.error)
          }
        />
      )}
      <div className="grid min-w-0 gap-4" data-appearance-form="">
        <BlockPropsForm
          schema={saved.schema}
          value={values}
          onChange={setValues}
          issues={issues}
          locale={locale}
          disabled={disabled}
          enumLabel={enumLabel}
          labels={{
            item: t("editor.blocks.item"),
            addItem: t("editor.blocks.addItem"),
            removeItem: t("editor.blocks.removeItem"),
            moveUp: t("editor.blocks.moveUp"),
            moveDown: t("editor.blocks.moveDown"),
          }}
        />
        {colors && (
          <ColorRolePreview
            schemes={[
              {
                id: "light",
                label: t("siteSettings.appearance.colors.light"),
                roles: colors.light,
              },
              ...(colors.source === "seed"
                ? [
                    {
                      id: "dark",
                      label: t("siteSettings.appearance.colors.dark"),
                      roles: colors.dark,
                    },
                  ]
                : []),
            ]}
            roles={COLOR_ROLES.map((role) => ({
              role,
              label: t(`siteSettings.appearance.colors.roles.${role}`),
            }))}
            notes={colors.repairs.map((r) =>
              t(
                r.kind === "pair"
                  ? "siteSettings.appearance.colors.repairPair"
                  : "siteSettings.appearance.colors.repairFill",
                {
                  scheme: t(`siteSettings.appearance.colors.${r.scheme}`),
                  role: t(`siteSettings.appearance.colors.roles.${r.role}`),
                  against: t(`siteSettings.appearance.colors.roles.${r.against}`),
                  direction: t(`siteSettings.appearance.colors.${r.direction}`),
                  steps: String(r.steps),
                  ratio: String(r.ratio),
                },
              ),
            )}
            labels={{
              preview: t("siteSettings.appearance.colors.preview"),
              heading: t("siteSettings.appearance.colors.heading"),
              body: t("siteSettings.appearance.colors.body"),
              link: t("siteSettings.appearance.colors.link"),
              button: t("siteSettings.appearance.colors.button"),
              accent: t("siteSettings.appearance.colors.accent"),
              notes: t("siteSettings.appearance.colors.notes"),
            }}
          />
        )}
        {colors?.source === "legacy" && colors.seedAvailable && (
          <Text variant="secondary" size="sm">
            {t("siteSettings.appearance.colors.legacy")}
          </Text>
        )}
        <Text variant="secondary" size="sm">
          {disabled && gate.reason ? gate.reason : t("siteSettings.appearance.publishHint")}
        </Text>
      </div>
    </SettingsSection>
  );
}
