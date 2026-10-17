import type { Taxonomy, Term } from "@cloudhal/core-contracts";
import { Banner, Field, Input, InputGroup, LayerDialog, Switch, Text } from "@cloudhal/ui";
import { Warning } from "@phosphor-icons/react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type MessageKey, useT } from "../i18n/index.tsx";
import { api } from "../lib/api.ts";
import {
  type SlugError,
  similarTerms,
  slugify,
  TERM_LIMITS,
  validateSlug,
} from "../lib/taxonomy.ts";
import { ErrorBanner } from "./ErrorBanner.tsx";
import { invalidateTaxonomy, type TaxonomyData } from "./Taxonomy.tsx";
import { TermCombobox, treeOptions } from "./TermPickers.tsx";
import { useToast } from "./Toast.ts";

const SLUG_ERROR: Record<SlugError, MessageKey> = {
  required: "governance.rename.errors.required",
  invalid: "governance.rename.errors.invalid",
  tooLong: "governance.rename.errors.tooLong",
  taken: "governance.rename.errors.taken",
  reserved: "governance.rename.errors.reserved",
};

/**
 * "New category" / "New tag" (DESIGN.md §2p): the name in the site's default locale, the slug
 * (derived from the name until edited), the parent for categories and the visibility. People
 * create active terms directly; a near-duplicate warning names the terms it looks like. The rest
 * (synonyms, description, image, SEO) lives in the term editor.
 */
export function CreateTermDialog({
  open,
  onOpenChange,
  tax,
  data,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tax: Taxonomy | undefined;
  data: TaxonomyData;
  onCreated?: (term: Term) => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [parentId, setParentId] = useState<string | null>(null);
  const [internal, setInternal] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName("");
    setSlug("");
    setSlugEdited(false);
    setParentId(null);
    setInternal(false);
    setSubmitted(false);
  }, [open]);
  const items = tax ? data.itemsOf(tax) : [];
  const terms = items.map((i) => i.term);
  const effectiveSlug = slugEdited ? slug : slugify(name);
  const nameError = !name.trim()
    ? "required"
    : name.trim().length > TERM_LIMITS.nameMax
      ? "tooLong"
      : undefined;
  const slugError = validateSlug(effectiveSlug, terms);
  const similar = name.trim() ? similarTerms(terms, name, data.defaultLocale) : [];
  const forms = data.singularForms(tax);
  const create = useMutation({
    mutationFn: () =>
      api.terms.create(data.site.data?.id ?? (tax as Taxonomy).siteId, {
        taxonomyId: (tax as Taxonomy).id,
        slug: effectiveSlug,
        status: "active",
        visibility: internal ? "internal" : "public",
        labels: { [data.defaultLocale]: { name: name.trim() } },
        ...(parentId ? { parentId } : {}),
      }),
    onSuccess: async ({ term }) => {
      await invalidateTaxonomy(qc, term.siteId);
      toast.success(
        t("taxonomy.create.created", { name: name.trim() }),
        t("governance.oneSnapshot"),
      );
      onCreated?.(term);
      onOpenChange(false);
    },
  });
  const submit = () => {
    setSubmitted(true);
    if (nameError || slugError) return;
    create.mutate();
  };
  return (
    <LayerDialog.Root open={open} onOpenChange={onOpenChange} dismissDisabled={create.isPending}>
      <LayerDialog.Content size="base" closeLabel={t("common.close")}>
        <LayerDialog.Title>{t("taxonomy.create.title", forms)}</LayerDialog.Title>
        <LayerDialog.Description>
          {tax?.hierarchical
            ? t("taxonomy.create.descriptionTree")
            : t("taxonomy.create.description")}
        </LayerDialog.Description>
        <LayerDialog.Body>
          <div className="grid gap-5" data-testid="create-term">
            <Input
              label={t("taxonomy.create.name", { locale: data.defaultLocale })}
              value={name}
              onValueChange={setName}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              error={
                submitted && nameError
                  ? nameError === "required"
                    ? t("termEditor.errors.nameRequired")
                    : t("termEditor.errors.nameTooLong")
                  : undefined
              }
              maxLength={TERM_LIMITS.nameMax}
              className="w-full"
              autoFocus
              data-testid="create-name"
            />
            {similar.length > 0 && (
              <Banner
                variant="alert"
                size="sm"
                icon={<Warning weight="fill" />}
                title={t("taxonomy.create.similarTitle")}
                description={t("taxonomy.create.similar", {
                  names: similar
                    .slice(0, 3)
                    .map((x) => data.name(x))
                    .join(", "),
                })}
                data-testid="create-similar"
              />
            )}
            <Field
              label={t("governance.rename.slug")}
              description={t("taxonomy.create.slugHint")}
              error={
                (submitted || slugEdited) && slugError && effectiveSlug
                  ? { message: t(SLUG_ERROR[slugError]), match: true }
                  : submitted && slugError
                    ? { message: t(SLUG_ERROR[slugError]), match: true }
                    : undefined
              }
            >
              <InputGroup className="w-full">
                <InputGroup.Addon>{tax?.archive.basePath ?? ""}/</InputGroup.Addon>
                <InputGroup.Input
                  aria-label={t("governance.rename.slug")}
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugEdited(true);
                    setSlug(slugify((e.target as HTMLInputElement).value));
                  }}
                  spellCheck={false}
                  className="font-mono"
                  data-testid="create-slug"
                />
              </InputGroup>
            </Field>
            {tax?.hierarchical && (
              <TermCombobox
                label={t("governance.move.parent")}
                description={t("taxonomy.create.parentHint")}
                options={treeOptions(items, data.name)}
                value={parentId}
                onChange={setParentId}
                name={data.name}
                none={t("governance.move.topLevel")}
                placeholder={t("governance.move.parentPlaceholder")}
              />
            )}
            <div className="grid gap-1.5">
              <Switch
                label={t("taxonomy.create.internal")}
                checked={internal}
                onCheckedChange={(v: boolean) => setInternal(v)}
              />
              <Text variant="secondary" size="sm">
                {t("taxonomy.create.internalHint")}
              </Text>
            </div>
            <ErrorBanner error={create.error} />
          </div>
        </LayerDialog.Body>
        <LayerDialog.Actions dismissLabel={t("common.cancel")}>
          <LayerDialog.Actions.Primary
            loading={create.isPending}
            onClick={submit}
            data-testid="create-submit"
          >
            {t("taxonomy.create.submit", forms)}
          </LayerDialog.Actions.Primary>
        </LayerDialog.Actions>
      </LayerDialog.Content>
    </LayerDialog.Root>
  );
}
