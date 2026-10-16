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
  const t = useT("appearance");
  const colors = useMemo(() => siteColorTokens(values, properties), [values, properties]);
  return (
    <>
      <ColorRolePreview
        schemes={[
          {
            id: "light",
            label: t("appearance.light"),
            roles: colors.light,
          },
          ...(colors.source === "seed"
            ? [
                {
                  id: "dark",
                  label: t("appearance.dark"),
                  roles: colors.dark,
                },
              ]
            : []),
        ]}
        roles={COLOR_ROLES.map((role) => ({
          role,
          label: t(`appearance.roles.${role}`),
        }))}
        notes={colors.repairs.map((r) =>
          t(r.kind === "pair" ? "appearance.repairPair" : "appearance.repairFill", {
            scheme: t(`appearance.${r.scheme}`),
            role: t(`appearance.roles.${r.role}`),
            against: t(`appearance.roles.${r.against}`),
            direction: t(`appearance.${r.direction}`),
            steps: String(r.steps),
            ratio: String(r.ratio),
          }),
        )}
        labels={{
          preview: t("appearance.preview"),
          heading: t("appearance.heading"),
          body: t("appearance.body"),
          link: t("appearance.link"),
          button: t("appearance.button"),
          accent: t("appearance.accent"),
          notes: t("appearance.notes"),
        }}
      />
      {colors.source === "legacy" && colors.seedAvailable && (
        <Text variant="secondary" size="sm">
          {t("appearance.legacy")}
        </Text>
      )}
    </>
  );
}
