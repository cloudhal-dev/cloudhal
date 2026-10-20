import { Banner, Button, LinkButton } from "@cloudflare/kumo";
import { ArrowCounterClockwise, CloudArrowUp, Timer } from "@phosphor-icons/react";

export interface PlaygroundBarLabels {
  /** "Playground" */
  title: string;
  /** Time left and the privacy note, already formatted ("41 minutes left. Everything …"). */
  description: string;
  /** "Reset" */
  reset: string;
  /** "Deploy to Cloudflare" */
  deploy: string;
}

export interface PlaygroundBarProps {
  labels: PlaygroundBarLabels;
  /** Where "Deploy to Cloudflare" leads (`features.playground.deployUrl`). */
  deployHref: string;
  onReset: () => void;
  resetting?: boolean;
  className?: string;
}

/**
 * The playground session bar (RFC-0036 §5, DESIGN.md §2af): a compact secondary `Banner` under the
 * top bar with the time left, Reset and "Deploy to Cloudflare". Shown only when `/api/instance`
 * reports `features.playground`.
 */
export function PlaygroundBar({
  labels,
  deployHref,
  onReset,
  resetting = false,
  className,
}: PlaygroundBarProps) {
  return (
    <Banner
      variant="secondary"
      size="sm"
      icon={<Timer />}
      title={labels.title}
      description={labels.description}
      className={className}
      data-testid="playground-bar"
      action={
        <>
          <Button
            size="xs"
            variant="ghost"
            icon={<ArrowCounterClockwise />}
            loading={resetting}
            onClick={onReset}
          >
            {labels.reset}
          </Button>
          <LinkButton
            size="xs"
            variant="primary"
            icon={<CloudArrowUp />}
            href={deployHref}
            external
          >
            {labels.deploy}
          </LinkButton>
        </>
      }
    />
  );
}
