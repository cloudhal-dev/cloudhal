import type { FieldImageSlot } from "@cloudhal/ui";
import { Button, Field, ImagePreview, InsetPanel, SkeletonLine, Text } from "@cloudhal/ui";
import { Images, Trash } from "@phosphor-icons/react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { assetMeta, assetPreviewUrl, assetTitle } from "../../lib/media.ts";
import { AssetPickerDialog } from "../MediaPicker.tsx";

/**
 * An image field (RFC-0041 §2): the chosen media-library image as a thumbnail with its title, and
 * "Choose image" / "Change" / "Remove"; the value is the bare asset id (the alt text is the
 * asset's own, per language). The picker is the editor's (`AssetPickerDialog`).
 */
export function FieldImage({
  siteId,
  defaultLocale,
  slot,
}: {
  siteId: string;
  defaultLocale: string;
  slot: FieldImageSlot;
}) {
  const { t, locale } = useI18n("fields", "media");
  const [open, setOpen] = useState(false);
  const id = slot.value;
  const detail = useQuery({
    queryKey: ["asset", siteId, id],
    queryFn: () => api.assets.get(siteId, id as string),
    enabled: Boolean(id),
  });
  const asset = detail.data?.asset;
  return (
    <Field
      label={slot.label}
      description={slot.description}
      error={slot.error ? { message: slot.error, match: true } : undefined}
    >
      <InsetPanel layout="row" label={slot.label}>
        <span className="flex min-w-0 items-center gap-3" data-field-image={id ?? ""}>
          <ImagePreview
            size="thumb"
            src={asset ? assetPreviewUrl(siteId, asset) : undefined}
            alt={asset?.alt?.[locale] ?? asset?.alt?.[defaultLocale] ?? ""}
            labels={{
              empty: t("fields.image.empty"),
              loading: t("seo.cover.loading"),
              error: t("seo.cover.broken"),
            }}
          />
          <span className="grid min-w-0 gap-0.5">
            {!id ? (
              <Text as="span" variant="secondary">
                {t("fields.image.empty")}
              </Text>
            ) : asset ? (
              <>
                <Text as="span" bold truncate>
                  {assetTitle(asset, locale, defaultLocale)}
                </Text>
                <Text as="span" variant="secondary" size="sm">
                  {assetMeta(asset, locale)}
                </Text>
              </>
            ) : detail.isError ? (
              <Text as="span" variant="error" size="sm">
                {t("media.field.missing")}
              </Text>
            ) : (
              <SkeletonLine />
            )}
          </span>
        </span>
        {!slot.readOnly && (
          <span className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" icon={<Images />} onClick={() => setOpen(true)}>
              {id ? t("fields.image.change") : t("fields.image.choose")}
            </Button>
            {id && (
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash />}
                onClick={() => slot.onChange(undefined)}
              >
                {t("fields.image.remove")}
              </Button>
            )}
          </span>
        )}
      </InsetPanel>
      <AssetPickerDialog
        siteId={siteId}
        defaultLocale={defaultLocale}
        open={open}
        onOpenChange={setOpen}
        currentId={id}
        onPick={(item) => {
          slot.onChange(item.asset.id);
          setOpen(false);
        }}
      />
    </Field>
  );
}
