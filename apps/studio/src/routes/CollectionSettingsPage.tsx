import type { CollectionSettings, Site, Taxonomy } from "@cloudhal/core-contracts";
import { collectionSettings } from "@cloudhal/core-ts/collections";
import { collectionPermalink, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
import {
  Button,
  Checkbox,
  Input,
  Link,
  PageLayout,
  Select,
  SkeletonLine,
  Text,
} from "@cloudhal/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useState } from "react";
import {
  COLLECTION_COMMENTS_SECTION,
  CollectionCommentsSection,
} from "../components/CollectionCommentsSection.tsx";
import { SiteCrumbs } from "../components/Crumbs.tsx";
import { ErrorBanner } from "../components/ErrorBanner.tsx";
import { ReadOnly } from "../components/Gating.tsx";
import { SettingsLayout, SettingsSection } from "../components/Settings.tsx";
import { useTaxonomyData } from "../components/Taxonomy.tsx";
import { SwitchField } from "../components/TaxonomySettingsDialog.tsx";
import { useToast } from "../components/Toast.ts";
import { useGate } from "../components/useMe.ts";
import { useI18n } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import { COLLECTION_ICON_NAMES, collectionName, useCollections } from "../lib/collections.ts";
import { languageOption } from "../lib/languages.ts";

// RFC-0041 §7: the fields builder and its operation dialogs load with this screen's section only.
const FieldsSection = lazy(() =>
  import("../components/fields/FieldsSection.tsx").then((m) => ({ default: m.FieldsSection })),
);

type Sort = NonNullable<CollectionSettings["sort"]>;
type LabelForm = Record<string, { singular: string; plural: string; description: string }>;

/** The form's labels: one row per site locale, empty where the collection has none. */
export function labelForm(site: Site, settings: CollectionSettings): LabelForm {
  const locales = [site.defaultLocale, ...site.locales.filter((l) => l !== site.defaultLocale)];
  return Object.fromEntries(
    locales.map((l) => {
      const label = settings.labels?.[l];
      return [
        l,
        {
          singular: label?.singular ?? "",
          plural: label?.plural ?? "",
          description: label?.description ?? "",
        },
      ];
    }),
  );
}

/** The settings with the form applied: complete label rows only, defaults left out. */
export function withForm(
  settings: CollectionSettings,
  form: { labels: LabelForm; icon: string; feed: boolean; sitemap: boolean; sort: Sort },
): CollectionSettings {
  const { labels: _l, icon: _i, feed: _f, sitemap: _s, sort: _o, ...rest } = settings;
  const labels = Object.fromEntries(
    Object.entries(form.labels)
      .filter(([, v]) => v.singular.trim() && v.plural.trim())
      .map(([l, v]) => [
        l,
        {
          singular: v.singular.trim(),
          plural: v.plural.trim(),
          ...(v.description.trim() ? { description: v.description.trim() } : {}),
        },
      ]),
  );
  return {
    ...rest,
    ...(Object.keys(labels).length ? { labels } : {}),
    ...(form.icon ? { icon: form.icon } : {}),
    ...(form.feed ? {} : { feed: false }),
    ...(form.sitemap ? {} : { sitemap: false }),
    ...(form.sort === "newest" ? {} : { sort: form.sort }),
  };
}

/**
 * Site › a collection › Settings (RFC-0040 §4, DESIGN.md §2c): its names in every site language,
 * icon, feed, sitemap and default order (one save, a site settings change), and which categories
 * and tags apply (saved on the taxonomies), its comments (saved in `comment_settings`). Its address
 * stays in Site settings › Collections.
 */
export function CollectionSettingsPage() {
  const { t, locale } = useI18n("collections", "fields");
  const { siteId, collection } = useParams({
    from: "/sites/$siteId/collections/$collection/settings",
  });
  const site = useQuery({ queryKey: ["site", siteId], queryFn: () => api.sites.get(siteId) });
  const gate = useGate("settings.write");
  const registry = useCollections(siteId);
  const info = registry.data?.find((c) => c.key === collection);
  const name = collectionName(site.data, collection, locale, t("nav.articles"));
  return (
    <PageLayout
      crumbs={
        <SiteCrumbs
          siteId={siteId}
          trail={[
            { label: t("collections.title"), href: `/sites/${siteId}/collections` },
            { label: name, href: `/sites/${siteId}/collections/${collection}` },
            { label: t("collectionList.settings") },
          ]}
        />
      }
      title={t("collections.settings.title", { name })}
      description={t("collections.settings.description")}
    >
      <ErrorBanner error={site.error ?? registry.error} />
      <SettingsLayout
        title={t("common.onThisPage")}
        sections={[
          { id: "names", label: t("collections.settings.names") },
          { id: "listing", label: t("collections.settings.listing") },
          { id: "fields", label: t("fields.builder.title") },
          { id: "taxonomies", label: t("collections.settings.taxonomies") },
          { id: COLLECTION_COMMENTS_SECTION, label: t("collections.settings.comments") },
          { id: "address", label: t("collections.settings.address") },
        ]}
      >
        <ReadOnly reason={gate.reason} className="grid min-w-0 content-start gap-6">
          {site.data && (
            <SettingsForm
              site={site.data}
              collection={collection}
              settings={info?.settings ?? site.data.collections?.[collection] ?? {}}
            />
          )}
          {site.data && (
            <Suspense fallback={<FieldsSkeleton />}>
              <FieldsSection
                site={site.data}
                collection={collection}
                settings={site.data.collections?.[collection] ?? {}}
                readOnlyReason={gate.reason}
              />
            </Suspense>
          )}
          <TaxonomiesSection siteId={siteId} collection={collection} />
          <CollectionCommentsSection siteId={siteId} collection={collection} />
          <AddressSection siteId={siteId} site={site.data} collection={collection} />
        </ReadOnly>
      </SettingsLayout>
    </PageLayout>
  );
}

function SettingsForm({
  site,
  collection,
  settings,
}: {
  site: Site;
  collection: string;
  settings: CollectionSettings;
}) {
  const { t, locale } = useI18n("collections");
  const qc = useQueryClient();
  const toast = useToast();
  const defaults = collectionSettings(site, collection);
  const [labels, setLabels] = useState(() => labelForm(site, settings));
  const [icon, setIcon] = useState(settings.icon ?? "");
  const [feed, setFeed] = useState(defaults.feed);
  const [sitemap, setSitemap] = useState(defaults.sitemap);
  const [sort, setSort] = useState<Sort>(defaults.sort);
  useEffect(() => {
    setLabels(labelForm(site, settings));
    setIcon(settings.icon ?? "");
  }, [site.rev]);
  const save = useMutation({
    mutationFn: () =>
      api.collections.save(
        site,
        collection,
        withForm(settings, { labels, icon, feed, sitemap, sort }),
      ),
    onSuccess: async ({ site: saved }) => {
      qc.setQueryData(["site", site.id], saved);
      await qc.invalidateQueries({ queryKey: ["collections", site.id] });
      toast.success(t("collections.settings.saved"), t("common.rev", { rev: saved.rev }));
    },
  });
  const set = (l: string, field: "singular" | "plural" | "description", value: string) =>
    setLabels((prev) => ({
      ...prev,
      [l]: { ...(prev[l] ?? { singular: "", plural: "", description: "" }), [field]: value },
    }));
  const footer = (
    <div className="flex justify-end">
      <Button
        variant="primary"
        onClick={() => save.mutate()}
        loading={save.isPending}
        data-testid="save-collection"
      >
        {t("collections.settings.save")}
      </Button>
    </div>
  );
  const iconItems = {
    "": t("collections.icons.files"),
    ...Object.fromEntries(COLLECTION_ICON_NAMES.map((n) => [n, t(`collections.icons.${n}`)])),
  };
  return (
    <>
      <SettingsSection
        id="names"
        title={t("collections.settings.names")}
        description={t("collections.settings.namesDescription")}
        footer={footer}
      >
        <div className="grid gap-6">
          <ErrorBanner error={save.error} />
          <Text variant="mono-secondary" as="span">
            {t("collections.settings.key", { key: collection })}
          </Text>
          {Object.entries(labels).map(([l, v]) => (
            <fieldset key={l} className="grid gap-3" data-locale={l}>
              <Text bold as="span">
                {languageOption(locale, l)}
              </Text>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  className="w-full"
                  label={t("collections.create.plural")}
                  value={v.plural}
                  onValueChange={(x) => set(l, "plural", x)}
                  maxLength={100}
                />
                <Input
                  className="w-full"
                  label={t("collections.create.singular")}
                  value={v.singular}
                  onValueChange={(x) => set(l, "singular", x)}
                  maxLength={100}
                />
              </div>
              <Input
                className="w-full"
                label={t("collections.settings.descriptionField")}
                description={t("collections.settings.descriptionHint")}
                value={v.description}
                onValueChange={(x) => set(l, "description", x)}
                maxLength={1000}
              />
            </fieldset>
          ))}
          <Select
            className="w-full"
            label={t("collections.settings.appearance")}
            description={t("collections.settings.appearanceDescription")}
            value={icon}
            onValueChange={(v) => setIcon(v as string)}
            items={iconItems}
          />
        </div>
      </SettingsSection>
      <SettingsSection
        id="listing"
        title={t("collections.settings.listing")}
        description={t("collections.settings.listingDescription")}
        footer={footer}
      >
        <div className="grid gap-5">
          <SwitchField
            label={t("collections.settings.feed")}
            hint={t("collections.settings.feedHint")}
            checked={feed}
            onChange={setFeed}
            testId="collection-feed"
          />
          <SwitchField
            label={t("collections.settings.sitemap")}
            hint={t("collections.settings.sitemapHint")}
            checked={sitemap}
            onChange={setSitemap}
            testId="collection-sitemap"
          />
          <Select
            className="w-full"
            label={t("collections.settings.sort")}
            description={t("collections.settings.sortHint")}
            value={sort}
            onValueChange={(v) => setSort(v as Sort)}
            items={{
              newest: t("collections.settings.sorts.newest"),
              oldest: t("collections.settings.sorts.oldest"),
              title: t("collections.settings.sorts.title"),
            }}
          />
        </div>
      </SettingsSection>
    </>
  );
}

/** The Fields section while its code loads. */
function FieldsSkeleton() {
  const { t } = useI18n("fields");
  return (
    <SettingsSection id="fields" title={t("fields.builder.title")}>
      <div className="grid gap-3" role="status">
        <span className="sr-only">{t("common.loading")}</span>
        <SkeletonLine minWidth={30} maxWidth={45} />
        <SkeletonLine minWidth={60} maxWidth={85} />
      </div>
    </SettingsSection>
  );
}

/** Which taxonomies apply: saved on each changed taxonomy's `collections`. */
function TaxonomiesSection({ siteId, collection }: { siteId: string; collection: string }) {
  const { t } = useI18n("collections");
  const qc = useQueryClient();
  const toast = useToast();
  const data = useTaxonomyData(siteId);
  const taxonomies = data.taxonomies.data ?? [];
  const toggle = useMutation({
    mutationFn: ({ tax, on }: { tax: Taxonomy; on: boolean }) => {
      const current = tax.collections ?? [];
      const next = on ? [...current, collection] : current.filter((c) => c !== collection);
      const { collections: _c, ...rest } = tax;
      const [first, ...more] = next;
      return api.taxonomies.update(
        first ? { ...rest, collections: [first, ...more] } : (rest as Taxonomy),
      );
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["taxonomies", siteId] });
      toast.success(t("collections.settings.saved"));
    },
  });
  return (
    <SettingsSection
      id="taxonomies"
      title={t("collections.settings.taxonomies")}
      description={t("collections.settings.taxonomiesDescription")}
    >
      <div className="grid gap-3">
        <ErrorBanner error={toggle.error} />
        {taxonomies.length === 0 && (
          <Text variant="secondary">{t("collections.settings.noTaxonomies")}</Text>
        )}
        {taxonomies.map((tax) =>
          tax.collections ? (
            <Checkbox
              key={tax.id}
              label={data.label(tax)}
              checked={tax.collections.includes(collection)}
              disabled={toggle.isPending}
              onCheckedChange={(on: boolean) => toggle.mutate({ tax, on })}
            />
          ) : (
            <Text key={tax.id} as="span">
              {t("collections.settings.taxonomyAll", { label: data.label(tax) })}
            </Text>
          ),
        )}
      </div>
    </SettingsSection>
  );
}

/** Where entries live: shown here, changed in Site settings › Collections (redirect preview). */
function AddressSection({
  siteId,
  site,
  collection,
}: {
  siteId: string;
  site: Site | undefined;
  collection: string;
}) {
  const { t } = useI18n("collections");
  return (
    <SettingsSection
      id="address"
      title={t("collections.settings.address")}
      description={t("collections.settings.addressDescription")}
    >
      <div className="grid gap-2">
        <Text variant="mono" as="span">
          {`${permalinkPrefix(collectionPermalink(site, collection))}/{slug}`}
        </Text>
        <Link href={`/sites/${siteId}/settings#collections`}>
          {t("collections.settings.addressLink")}
        </Link>
      </div>
    </SettingsSection>
  );
}
