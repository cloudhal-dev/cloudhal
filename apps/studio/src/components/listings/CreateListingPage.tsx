import type { Site } from "@cloudhal/core-contracts";
import { collectionPermalink, permalinkPrefix } from "@cloudhal/core-ts/permalinks";
import { Button, LinkButton } from "@cloudhal/ui";
import { ListBullets } from "@phosphor-icons/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useI18n } from "../../i18n/index.tsx";
import { api } from "../../lib/api.ts";
import { apiErrorText } from "../../lib/api-errors.ts";
import { listingSection, listingTitle } from "../../lib/listings.ts";
import { sectionId } from "../page-editor/sections.ts";
import { useToast } from "../Toast.ts";
import { useCan } from "../useMe.ts";

/**
 * RFC-0042 §5 "Create listing page": a draft page at the collection's address (`/events`), titled
 * with its plural name, holding one `contentList` section of the collection (upcoming first when it
 * has a date list field and an expiry). It goes through the ordinary page write, then opens in the
 * page editor. When a page already lives at that address, the action opens it instead.
 */
export function CreateListingPage({ site, collection }: { site: Site; collection: string }) {
  const { t } = useI18n("listings");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const toast = useToast();
  const canWrite = useCan("pages.write");
  const pages = useQuery({
    queryKey: ["pages", site.id],
    queryFn: () => api.pages.list(site.id),
    enabled: canWrite,
  });
  const path = permalinkPrefix(collectionPermalink(site, collection));
  const existing = pages.data?.find((p) => p.path === path && p.locale === site.defaultLocale);
  const create = useMutation({
    mutationFn: () =>
      api.pages.create(site.id, {
        path,
        title: listingTitle(site, collection),
        locale: site.defaultLocale,
        status: "draft",
        sections: [listingSection(sectionId(), collection, site.collections?.[collection] ?? {})],
      }),
    onSuccess: async ({ page, site: next }) => {
      qc.setQueryData(["site", site.id], next);
      await qc.invalidateQueries({ queryKey: ["pages", site.id] });
      toast.success(t("listings.createPage.created"), page.path);
      await navigate({
        to: "/sites/$siteId/pages/$pageId",
        params: { siteId: site.id, pageId: page.id },
      });
    },
    onError: (error) => {
      toast.error(t("errors.title"), apiErrorText(t, error));
      // Someone may have made a page at that address meanwhile: the action then opens it.
      void pages.refetch();
    },
  });
  if (!canWrite) return null;
  if (existing)
    return (
      <LinkButton
        href={`/sites/${site.id}/pages/${existing.id}`}
        variant="secondary"
        icon={ListBullets}
        title={t("listings.createPage.exists", { path })}
        data-testid="open-listing-page"
      >
        {t("listings.createPage.open")}
      </LinkButton>
    );
  return (
    <Button
      variant="secondary"
      icon={<ListBullets />}
      onClick={() => create.mutate()}
      loading={create.isPending}
      disabled={pages.isPending}
      data-testid="create-listing-page"
    >
      {t("listings.createPage.action")}
    </Button>
  );
}
