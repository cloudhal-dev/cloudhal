import type { CollectionSettings, Site } from "@cloudhal/core-contracts";
import { Banner, Input, LayerDialog, Select } from "@cloudhal/ui";
import { WarningCircle } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { apiErrorText } from "../lib/api-errors.ts";
import { validatePrefix } from "../lib/collection-permalinks.ts";
import { COLLECTION_ICON_NAMES } from "../lib/collections.ts";
import { slugify } from "../lib/workflow.ts";
import { useToast } from "./Toast.ts";

const KEY = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What the form makes: the declared settings, the permalink only when not the default. */
export function newCollectionSettings(input: {
  key: string;
  plural: string;
  singular: string;
  icon: string;
  prefix: string;
  locale: string;
}): CollectionSettings {
  const prefix = input.prefix.trim();
  return {
    labels: { [input.locale]: { singular: input.singular.trim(), plural: input.plural.trim() } },
    icon: input.icon,
    ...(prefix && prefix !== `/${input.key}` ? { permalink: `${prefix}/{slug}` } : {}),
  };
}

/**
 * "New collection" (RFC-0040 §4): plural and singular name in the site's default language, the
 * key (derived from the name until edited, immutable afterwards), an icon and the address prefix.
 * The API checks the prefix against other collections, archives and reserved paths (409).
 */
export function NewCollectionDialog({
  open,
  onOpenChange,
  site,
  taken,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  site: Site | undefined;
  taken: readonly string[];
}) {
  const { t } = useI18n("collections");
  const [plural, setPlural] = useState("");
  const [singular, setSingular] = useState("");
  const [key, setKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [icon, setIcon] = useState("files");
  const [prefix, setPrefix] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const create = useCreateCollection(site, () => onOpenChange(false), {
    key,
    settings: () =>
      newCollectionSettings({
        key,
        plural,
        singular,
        icon,
        prefix,
        locale: site?.defaultLocale ?? "en",
      }),
    name: () => plural.trim(),
  });
  // Every opening starts clean.
  useEffect(() => {
    if (!open) return;
    setPlural("");
    setSingular("");
    setKey("");
    setKeyEdited(false);
    setIcon("files");
    setPrefix("");
    setSubmitted(false);
    create.reset();
  }, [open]);

  const required = (v: string) =>
    submitted && !v.trim() ? t("collections.create.required") : undefined;
  const keyError =
    submitted && (!KEY.test(key) || taken.includes(key))
      ? t("collections.create.keyInvalid")
      : undefined;
  const prefixProblem = prefix.trim() ? validatePrefix(prefix) : undefined;
  const prefixError = prefixProblem
    ? t(`siteSettings.collections.errors.${prefixProblem}`)
    : undefined;
  const valid =
    plural.trim() && singular.trim() && KEY.test(key) && !taken.includes(key) && !prefixProblem;
  const submit = () => {
    setSubmitted(true);
    if (create.isPending || !valid) return;
    create.mutate();
  };
  const icons = Object.fromEntries(
    COLLECTION_ICON_NAMES.map((name) => [name, t(`collections.icons.${name}`)]),
  );
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("collections.create.title")}</LayerDialog.Title>
        <LayerDialog.Description>{t("collections.create.description")}</LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="new-collection-form">
            {create.error && (
              <Banner
                variant="error"
                size="sm"
                icon={<WarningCircle weight="fill" />}
                title={t("collections.create.failed")}
                description={apiErrorText(t, create.error)}
              />
            )}
            <Input
              className="w-full"
              label={t("collections.create.plural")}
              description={t("collections.create.pluralHint")}
              value={plural}
              onValueChange={(v) => {
                setPlural(v);
                // "ı" has no decomposition: map it, or "Etkinlikları" would lose letters.
                if (!keyEdited) setKey(v.trim() ? slugify(v.replace(/ı/g, "i")).slice(0, 64) : "");
              }}
              error={required(plural)}
              maxLength={100}
              autoFocus
            />
            <Input
              className="w-full"
              label={t("collections.create.singular")}
              description={t("collections.create.singularHint")}
              value={singular}
              onValueChange={setSingular}
              error={required(singular)}
              maxLength={100}
            />
            <Input
              className="w-full"
              label={t("collections.create.key")}
              description={t("collections.create.keyHint")}
              value={key}
              onValueChange={(v) => {
                setKey(v);
                setKeyEdited(true);
              }}
              error={keyError}
              maxLength={64}
            />
            <Select
              className="w-full"
              label={t("collections.create.icon")}
              value={icon}
              onValueChange={(v) => setIcon(v as string)}
              items={icons}
            />
            <Input
              className="w-full"
              label={t("collections.create.address")}
              description={t("collections.create.addressHint")}
              placeholder={key ? `/${key}` : undefined}
              value={prefix}
              onValueChange={setPrefix}
              error={prefixError}
              maxLength={200}
            />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary onClick={submit} loading={create.isPending}>
            {t("collections.create.submit")}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}

/** Saves the declaration, then shows the new collection's list. */
function useCreateCollection(
  site: Site | undefined,
  close: () => void,
  input: { key: string; settings: () => CollectionSettings; name: () => string },
) {
  const { t } = useI18n("collections");
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  return useMutation({
    mutationFn: async () => {
      if (!site) throw new Error("site not loaded");
      return api.collections.save(site, input.key, input.settings());
    },
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["collections", site?.id] }),
        qc.invalidateQueries({ queryKey: ["site", site?.id] }),
      ]);
      close();
      toast.success(
        t("collections.create.created"),
        t("collections.create.createdDescription", { name: input.name() }),
      );
      if (site)
        await navigate({
          to: "/sites/$siteId/collections/$collection",
          params: { siteId: site.id, collection: input.key },
        });
    },
  });
}
