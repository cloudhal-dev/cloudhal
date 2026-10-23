import { Badge, DirectionalIcon, InsetPanel, Text } from "@cloudhal/ui";
import { ArrowRight } from "@phosphor-icons/react";
import type { TFunction } from "../../i18n/index.tsx";
import type { FieldOperationResult } from "../../lib/api.ts";
import { languageOption } from "../../lib/languages.ts";

type FT = TFunction<"fields">;
type Report = FieldOperationResult["report"];
type Counts = Report["locales"][string];

const COUNT_KINDS = ["moved", "converted", "cleared", "removed", "unconvertible"] as const;

/** A stored value as one short line (values are data, shown as they are). */
export function sampleText(v: unknown): string {
  if (v === undefined || v === null) return "—";
  const text = typeof v === "string" ? v : JSON.stringify(v);
  return text.length > 80 ? `${text.slice(0, 79)}…` : text;
}

function CountRows({ t, counts }: { t: FT; counts: Counts & { unchanged?: number } }) {
  return (
    <>
      <div className="flex justify-between gap-3">
        <dt>
          <Text as="span">{t("fields.report.touched")}</Text>
        </dt>
        <dd>
          <Text as="span" bold>
            {counts.touched}
          </Text>
        </dd>
      </div>
      {COUNT_KINDS.filter((k) => counts[k] > 0).map((k) => (
        <div key={k} className="flex justify-between gap-3" data-count={k}>
          <dt>
            <Text as="span" variant={k === "unconvertible" ? "error" : undefined}>
              {t(`fields.report.kinds.${k}`)}
            </Text>
          </dt>
          <dd>
            <Text as="span" bold>
              {counts[k]}
            </Text>
          </dd>
        </div>
      ))}
    </>
  );
}

/**
 * The dry run of a field operation (RFC-0041 §6): entries read and changed, values moved,
 * converted, cleared, removed or that cannot be converted — in all and per language — and up to
 * five values before and after.
 */
export function FieldOperationReport({
  t,
  locale,
  report,
}: {
  t: FT;
  locale: string;
  report: Report;
}) {
  const locales = Object.entries(report.locales);
  return (
    <div className="grid gap-4" data-testid="field-operation-report">
      <InsetPanel>
        <dl className="grid gap-1.5">
          <div className="flex justify-between gap-3">
            <dt>
              <Text as="span">{t("fields.report.entries")}</Text>
            </dt>
            <dd>
              <Text as="span" bold>
                {report.entries}
              </Text>
            </dd>
          </div>
          <CountRows t={t} counts={report} />
          {report.unchanged > 0 && (
            <div className="flex justify-between gap-3">
              <dt>
                <Text as="span" variant="secondary">
                  {t("fields.report.unchanged")}
                </Text>
              </dt>
              <dd>
                <Text as="span">{report.unchanged}</Text>
              </dd>
            </div>
          )}
        </dl>
      </InsetPanel>
      {locales.length > 1 && (
        <div className="grid gap-2">
          <Text bold as="span">
            {t("fields.report.perLanguage")}
          </Text>
          {locales.map(([l, counts]) => (
            <InsetPanel key={l} label={languageOption(locale, l)}>
              <dl className="grid gap-1.5" data-report-locale={l}>
                <Text as="span" variant="secondary" size="sm">
                  {languageOption(locale, l)}
                </Text>
                <CountRows t={t} counts={counts} />
              </dl>
            </InsetPanel>
          ))}
        </div>
      )}
      {report.samples.length > 0 && (
        <div className="grid gap-2">
          <Text bold as="span">
            {t("fields.report.samples")}
          </Text>
          {report.samples.map((s) => (
            <InsetPanel key={`${s.entryId}-${s.kind}`} variant="recessed">
              <div className="grid min-w-0 gap-1" data-sample={s.kind}>
                <span className="flex flex-wrap items-center gap-2">
                  <Badge variant={s.kind === "unconvertible" ? "error" : "secondary"}>
                    {t(`fields.report.kinds.${s.kind}`)}
                  </Badge>
                  <Text as="span" variant="mono-secondary">
                    {s.entryId} · {s.locale}
                  </Text>
                </span>
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                  <Text as="span" variant="mono" truncate>
                    {sampleText(s.before)}
                  </Text>
                  <DirectionalIcon
                    icon={ArrowRight}
                    size={16}
                    aria-label={t("fields.report.becomes")}
                  />
                  <Text as="span" variant="mono" truncate>
                    {sampleText(s.after)}
                  </Text>
                </span>
              </div>
            </InsetPanel>
          ))}
        </div>
      )}
    </div>
  );
}
