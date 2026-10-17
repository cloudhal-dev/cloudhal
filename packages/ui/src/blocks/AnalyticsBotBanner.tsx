import { Banner, Collapsible, cn, Text } from "@cloudflare/kumo";
import { Robot } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

export interface AnalyticsBotBannerLabels {
  /** "Possible bot traffic" (likely) or "Unusual spike in page views" (watch). */
  title: string;
  /** What was seen and why it matters ("…numbers for this period may be inflated"). Plain text. */
  description: string;
  /** What to do (check top pages and referrers, the Rate Limiting binding). */
  advice: ReactNode;
  /** The disclosure's trigger ("Why this warning"). */
  details: string;
  /** Under the reasons: that this is a heuristic and what can look the same. */
  note: string;
}

export interface AnalyticsBotBannerProps {
  labels: AnalyticsBotBannerLabels;
  /** One sentence per reason, in the screen's language. */
  reasons: readonly { id: string; text: ReactNode }[];
  /** `Banner.Action`s ("Show that day"). */
  actions?: ReactNode;
  className?: string;
}

/**
 * "Possible bot traffic" (RFC-0006 §5.5, §10.1; DESIGN.md §2v): an alert `Banner` above the
 * Analytics cards when the API's `…/analytics/bots` level is `watch` or `likely`. The description
 * says what was seen, why it matters and what to do; a `Collapsible` lists the reasons (spike,
 * direct entrances, one browser, one page) with a note that it is a heuristic. Words are props.
 */
export function AnalyticsBotBanner({
  labels,
  reasons,
  actions,
  className,
}: AnalyticsBotBannerProps) {
  const [open, setOpen] = useState(false);
  return (
    <Banner
      variant="alert"
      icon={<Robot weight="fill" />}
      title={labels.title}
      // The actions wrap under the text on phones (as the quota banner does).
      className={cn("[&>div]:flex-wrap", className)}
      data-testid="analytics-bot-banner"
      description={
        <span className="grid max-w-2xl gap-3">
          <span className="grid gap-1.5">
            <Text as="span">{labels.description}</Text>
            <Text as="span">{labels.advice}</Text>
          </span>
          <Collapsible.Root open={open} onOpenChange={setOpen}>
            <Collapsible.DefaultTrigger>{labels.details}</Collapsible.DefaultTrigger>
            <Collapsible.DefaultPanel>
              <span className="grid gap-3">
                <ul className="m-0 grid list-disc gap-1.5 ps-5">
                  {reasons.map((r) => (
                    <li key={r.id}>
                      <Text as="span">{r.text}</Text>
                    </li>
                  ))}
                </ul>
                <Text as="span" variant="secondary">
                  {labels.note}
                </Text>
              </span>
            </Collapsible.DefaultPanel>
          </Collapsible.Root>
        </span>
      }
      action={actions}
    />
  );
}
