/**
 * Site › Settings › Header and footer (RFC-0025 §5): the site's brand, header and footer as forms
 * generated from the same schemas agents read (`chromeSchemas`), one segment at a time. Logos are
 * picked from the media library (stored as `asset:<id>`; the server writes the image reference).
 * Saved together, checked by the server (menus that exist, buttons with links), shown on the site
 * after a publish.
 */

import type { PropsSchema } from "@cloudhal/core-ts/blocks";
import { validateProps } from "@cloudhal/core-ts/blocks";
import { Banner, BlockPropsForm, Button, SkeletonLine, Tabs, Text } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { ApiRequestError, api, json, request } from "../lib/api.ts";
import { useBlockEnumLabel } from "./BlockSection.tsx";
import { AssetFrame } from "./Media.tsx";
import { AssetPickerDialog } from "./MediaPicker.tsx";
import { SettingsSection } from "./Settings.tsx";
import { useToast } from "./Toast.ts";
import { useGate } from "./useMe.ts";

export const CHROME_SETTINGS_SECTION = "chrome";

/** RFC-0025: the site's header, footer and brand (logos as `asset:<id>`), with their form schemas. */
interface ChromeSettings {
  header: Record<string, unknown>;
  announcement: Record<string, unknown>;
  consent: Record<string, unknown>;
  footer: Record<string, unknown>;
  brand: Record<string, unknown>;
  schemas: Record<Part, PropsSchema>;
  /** The menu keys the header and footer may name. */
  menus: string[];
  rev: number;
}

/** `/api/sites/:siteId/chrome` (here, not in `lib/api.ts`: only this lazy section calls it). */
const chromeApi = {
  get: (siteId: string): Promise<ChromeSettings> => request(`/api/sites/${siteId}/chrome`),
  /** Replaces the parts sent (an empty part is the default); 409 on a stale `rev`, 400 when they misfit. */
  save: (siteId: string, input: { rev: number } & Values): Promise<{ rev: number }> =>
    request(`/api/sites/${siteId}/chrome`, { method: "PUT", ...json(input) }),
};

type Part = "brand" | "header" | "footer" | "announcement" | "consent";
/** The segments: the bars (announcement, consent) share one. */
type Segment = "header" | "footer" | "bars" | "brand";
const PARTS: Record<Segment, readonly Part[]> = {
  header: ["header"],
  footer: ["footer"],
  bars: ["announcement", "consent"],
  brand: ["brand"],
};
type Values = Record<Part, Record<string, unknown>>;
const LOGOS = ["logo", "logoDark"] as const;
const ASSET = /^asset:(.+)$/;

const isConflict = (e: unknown) => e instanceof ApiRequestError && e.status === 409;

/** A schema without the fields the section draws itself. */
function without(schema: PropsSchema, keys: readonly string[]): PropsSchema {
  const properties = { ...schema.properties };
  for (const k of keys) delete properties[k];
  return { ...schema, properties };
}

/** One logo slot: its preview and the library picker. */
function LogoField({
  siteId,
  defaultLocale,
  label,
  value,
  onChange,
  disabled,
}: {
  siteId: string;
  defaultLocale: string;
  label: string;
  value: unknown;
  onChange: (next: string | undefined) => void;
  disabled: boolean;
}) {
  const { t } = useI18n("appearance");
  const [open, setOpen] = useState(false);
  const assetId = typeof value === "string" ? ASSET.exec(value)?.[1] : undefined;
  const asset = useQuery({
    queryKey: ["asset", siteId, assetId],
    queryFn: () => api.assets.get(siteId, assetId as string),
    enabled: assetId !== undefined,
  });
  return (
    <div className="grid gap-2" data-logo-field="">
      <Text bold as="span">
        {label}
      </Text>
      <div className="flex flex-wrap items-center gap-3">
        {assetId && asset.data ? (
          <div className="w-32">
            <AssetFrame siteId={siteId} asset={asset.data.asset} size="thumb" />
          </div>
        ) : assetId ? (
          <SkeletonLine />
        ) : (
          <Text variant="secondary" size="sm">
            {t("appearance.chrome.noLogo")}
          </Text>
        )}
        <Button variant="secondary" disabled={disabled} onClick={() => setOpen(true)}>
          {assetId ? t("appearance.chrome.replaceLogo") : t("appearance.chrome.chooseLogo")}
        </Button>
        {assetId && (
          <Button variant="ghost" disabled={disabled} onClick={() => onChange(undefined)}>
            {t("appearance.chrome.removeLogo")}
          </Button>
        )}
      </div>
      <AssetPickerDialog
        siteId={siteId}
        defaultLocale={defaultLocale}
        open={open}
        onOpenChange={setOpen}
        currentId={assetId}
        onPick={(item) => onChange(`asset:${item.asset.id}`)}
      />
    </div>
  );
}

export function ChromeSettingsSection({
  siteId,
  defaultLocale,
}: {
  siteId: string;
  defaultLocale: string;
}) {
  const { t, locale } = useI18n("appearance");
  const qc = useQueryClient();
  const toast = useToast();
  const gate = useGate("settings.write");
  const enumLabel = useBlockEnumLabel();
  const key = ["chrome", siteId] as const;
  const chrome = useQuery({ queryKey: key, queryFn: () => chromeApi.get(siteId) });
  const saved = chrome.data;
  const initial = useMemo<Values | undefined>(
    () =>
      saved
        ? {
            brand: saved.brand,
            header: saved.header,
            footer: saved.footer,
            announcement: saved.announcement,
            consent: saved.consent,
          }
        : undefined,
    [saved],
  );
  const [values, setValues] = useState<Values | undefined>();
  const [segment, setSegment] = useState<Segment>("header");
  useEffect(() => {
    if (initial) setValues(initial);
  }, [initial]);
  const issues = useMemo(() => {
    if (!saved || !values)
      return { brand: [], header: [], footer: [], announcement: [], consent: [] };
    return {
      brand: validateProps(without(saved.schemas.brand, LOGOS), values.brand),
      header: validateProps(saved.schemas.header, values.header),
      footer: validateProps(saved.schemas.footer, values.footer),
      announcement: validateProps(saved.schemas.announcement, values.announcement),
      consent: validateProps(saved.schemas.consent, values.consent),
    };
  }, [saved, values]);
  const save = useMutation({
    mutationFn: (v: Values) => chromeApi.save(siteId, { rev: saved?.rev ?? 0, ...v }),
    onSuccess: async () => {
      toast.success(t("appearance.chrome.saved"));
      await qc.invalidateQueries({ queryKey: key });
      await qc.invalidateQueries({ queryKey: ["site", siteId] });
    },
  });

  const title = t("appearance.chrome.title");
  if (!saved || !values)
    return (
      <SettingsSection id={CHROME_SETTINGS_SECTION} title={title}>
        <SkeletonLine />
      </SettingsSection>
    );
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  const invalid = Object.values(issues).some((list) => list.length > 0);
  const disabled = !gate.allowed;
  const set = (p: Part) => (next: Record<string, unknown>) =>
    setValues((v) => (v ? { ...v, [p]: next } : v));
  const labels = {
    item: t("editor.blocks.item"),
    addItem: t("editor.blocks.addItem"),
    removeItem: t("editor.blocks.removeItem"),
    moveUp: t("editor.blocks.moveUp"),
    moveDown: t("editor.blocks.moveDown"),
  };
  const logoTitle = (k: (typeof LOGOS)[number]) => {
    const own = saved.schemas.brand.properties[k]?.title;
    return typeof own === "string" ? own : (own?.[locale] ?? own?.en ?? k);
  };
  return (
    <SettingsSection
      id={CHROME_SETTINGS_SECTION}
      title={title}
      description={t("appearance.chrome.description")}
      footer={
        <>
          {dirty && initial && (
            <Button variant="ghost" onClick={() => setValues(initial)}>
              {t("common.discard")}
            </Button>
          )}
          <Button
            variant="primary"
            disabled={!dirty || invalid || disabled}
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
          title={t("appearance.chrome.failed")}
          description={
            isConflict(save.error)
              ? t("siteSettings.conflictDescription")
              : save.error instanceof Error
                ? save.error.message
                : String(save.error)
          }
        />
      )}
      <div className="grid min-w-0 gap-4" data-chrome-form="">
        <Tabs
          variant="segmented"
          value={segment}
          onValueChange={(v) => setSegment(v as Segment)}
          tabs={[
            { value: "header", label: t("appearance.chrome.header") },
            { value: "footer", label: t("appearance.chrome.footer") },
            { value: "bars", label: t("appearance.chrome.bars") },
            { value: "brand", label: t("appearance.chrome.brand") },
          ]}
        />
        {segment === "brand" &&
          LOGOS.map((k) => (
            <LogoField
              key={k}
              siteId={siteId}
              defaultLocale={defaultLocale}
              label={logoTitle(k)}
              value={values.brand[k]}
              disabled={disabled}
              onChange={(next) => {
                const brand = { ...values.brand };
                if (next) brand[k] = next;
                else delete brand[k];
                set("brand")(brand);
              }}
            />
          ))}
        {PARTS[segment].map((part) => (
          <div key={part} className="grid min-w-0 gap-4">
            {segment === "bars" && (
              <Text bold as="h3">
                {t(
                  part === "announcement"
                    ? "appearance.chrome.announcement"
                    : "appearance.chrome.consent",
                )}
              </Text>
            )}
            <BlockPropsForm
              schema={part === "brand" ? without(saved.schemas.brand, LOGOS) : saved.schemas[part]}
              value={values[part]}
              onChange={set(part)}
              issues={issues[part]}
              locale={locale}
              disabled={disabled}
              enumLabel={enumLabel}
              labels={labels}
            />
          </div>
        ))}
        <Text variant="secondary" size="sm">
          {disabled && gate.reason
            ? gate.reason
            : `${t("appearance.chrome.menus", { menus: saved.menus.join(", ") })} ${t("appearance.chrome.publishHint")}`}
        </Text>
      </div>
    </SettingsSection>
  );
}
