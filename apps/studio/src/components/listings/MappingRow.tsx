import type {
  EntryValueProperty,
  FieldDefinition,
  SiteValueProperty,
  StructuredDataSource,
} from "@cloudhal/core-contracts";
import { fieldLabel } from "@cloudhal/core-ts/fields";
import type { PathSpec } from "@cloudhal/core-ts/structured-data";
import { Badge, Input, Select, Text } from "@cloudhal/ui";
import { useI18n } from "../../i18n/index.tsx";
import { type SourceOption, sourceOptions, vocabularyKeys } from "../../lib/listings.ts";

/** The words of one source option ("Field: Starts", "Entry: Title", "Default: Entry: Summary"). */
export function useSourceLabel(defs: readonly FieldDefinition[], defaultLocale: string) {
  const { t, locale } = useI18n("listings");
  const sd = "listings.structuredData";
  const of = (source: StructuredDataSource | SourceOption): string => {
    switch (source.kind) {
      case "field": {
        const key = "field" in source ? source.field : (source.key ?? "");
        const def = defs.find((d) => d.key === key);
        return t(`${sd}.sources.field`, {
          label: def ? fieldLabel(def, locale, defaultLocale) : key,
        });
      }
      case "entry":
        return t(`${sd}.sources.entry`, {
          property: t(
            `${sd}.entryProps.${("property" in source ? source.property : source.key) as EntryValueProperty}`,
          ),
        });
      case "site":
        return t(`${sd}.sources.site`, {
          property: t(
            `${sd}.siteProps.${("property" in source ? source.property : source.key) as SiteValueProperty}`,
          ),
        });
      case "constant":
        return t(`${sd}.sources.constant`);
      default:
        return t(`${sd}.sources.unmapped`);
    }
  };
  return of;
}

/**
 * One property of a structured-data preset: its path in mono, Required / One of these, a `Select`
 * offering only the sources that fit (its default first, fields of a fitting type, entry and site
 * properties, a fixed value where allowed), the fixed value (a vocabulary `Select` on enum paths),
 * and this path's issues.
 */
export function MappingRow({
  path,
  spec,
  defs,
  defaultLocale,
  choice,
  constant,
  issues,
  disabled,
  onChange,
}: {
  path: string;
  spec: PathSpec;
  defs: readonly FieldDefinition[];
  defaultLocale: string;
  choice: string;
  constant: string;
  issues: readonly string[];
  disabled: boolean;
  onChange: (choice: string, constant: string) => void;
}) {
  const { t } = useI18n("listings");
  const sd = "listings.structuredData";
  const label = useSourceLabel(defs, defaultLocale);
  const options = sourceOptions(spec, defs);
  const items = options.map((o) => ({
    value: o.value,
    label:
      o.kind === "default" && spec.default
        ? t(`${sd}.sources.default`, { source: label(spec.default) })
        : label(o),
  }));
  const vocabulary = vocabularyKeys(spec);
  return (
    <div
      className="grid items-start gap-3 py-3 first:pt-0 last:pb-0 sm:grid-cols-2"
      data-path={path}
    >
      <div className="grid min-w-0 gap-1">
        <Text as="span" variant="mono" truncate>
          {path}
        </Text>
        <span className="flex flex-wrap items-center gap-2">
          {spec.required && <Badge variant="warning">{t(`${sd}.required`)}</Badge>}
          {spec.group && <Badge variant="outline">{t(`${sd}.oneOf`)}</Badge>}
        </span>
      </div>
      <div className="grid min-w-0 gap-2">
        <Select
          className="w-full"
          aria-label={t(`${sd}.source`)}
          value={choice}
          onValueChange={(v) => onChange(v as string, constant)}
          items={items}
          disabled={disabled}
          data-testid={`source-${path}`}
        />
        {choice === "constant" &&
          (vocabulary.length > 0 ? (
            <Select
              className="w-full"
              aria-label={t(`${sd}.constant`, { path })}
              value={constant || null}
              onValueChange={(v) => onChange(choice, v as string)}
              items={Object.fromEntries(vocabulary.map((k) => [k, k]))}
              disabled={disabled}
            />
          ) : (
            <Input
              className="w-full"
              aria-label={t(`${sd}.constant`, { path })}
              value={constant}
              maxLength={200}
              onValueChange={(v) => onChange(choice, v)}
              description={spec.kind === "currency" ? t(`${sd}.currencyHint`) : undefined}
              disabled={disabled}
            />
          ))}
        {issues.map((text) => (
          <Text key={text} variant="error" size="sm">
            {text}
          </Text>
        ))}
      </div>
    </div>
  );
}
