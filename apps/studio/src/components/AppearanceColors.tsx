/**
 * The color roles under the Appearance form (RFC-0023 §5): worked out live from the form's values
 * by the renderer's own expansion, light and (once a seed is set) dark, with the contrast repairs
 * in the person's language. Its words are a lazy namespace, loaded with the settings route.
 */
import { COLOR_ROLES, siteColorTokens } from "@cloudhal/core-ts/tokens";
import { ColorRolePreview, Text } from "@cloudhal/ui";
import { useMemo } from "react";
import { useT } from "../i18n/index.tsx";

export function AppearanceColors({
  properties,
  values,
}: {
  properties: Readonly<Record<string, { default?: unknown }>>;
  values: Readonly<Record<string, unknown>>;
}) {
  const t = useT("appearanceColors");
  const colors = useMemo(() => siteColorTokens(values, properties), [values, properties]);
  return (
    <>
      <ColorRolePreview
        schemes={[
          {
            id: "light",
            label: t("appearanceColors.light"),
            roles: colors.light,
          },
          ...(colors.source === "seed"
            ? [
                {
                  id: "dark",
                  label: t("appearanceColors.dark"),
                  roles: colors.dark,
                },
              ]
            : []),
        ]}
        roles={COLOR_ROLES.map((role) => ({
          role,
          label: t(`appearanceColors.roles.${role}`),
        }))}
        notes={colors.repairs.map((r) =>
          t(r.kind === "pair" ? "appearanceColors.repairPair" : "appearanceColors.repairFill", {
            scheme: t(`appearanceColors.${r.scheme}`),
            role: t(`appearanceColors.roles.${r.role}`),
            against: t(`appearanceColors.roles.${r.against}`),
            direction: t(`appearanceColors.${r.direction}`),
            steps: String(r.steps),
            ratio: String(r.ratio),
          }),
        )}
        labels={{
          preview: t("appearanceColors.preview"),
          heading: t("appearanceColors.heading"),
          body: t("appearanceColors.body"),
          link: t("appearanceColors.link"),
          button: t("appearanceColors.button"),
          accent: t("appearanceColors.accent"),
          notes: t("appearanceColors.notes"),
        }}
      />
      {colors.source === "legacy" && colors.seedAvailable && (
        <Text variant="secondary" size="sm">
          {t("appearanceColors.legacy")}
        </Text>
      )}
    </>
  );
}
