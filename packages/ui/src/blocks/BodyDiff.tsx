import { Badge, Button, cn, Text } from "@cloudflare/kumo";
import type { BlockChange, BodyDiff as BodyDiffData } from "@cloudhal/core-ts/body-blocks";
import { CaretDown } from "@phosphor-icons/react";
import { Fragment, useState } from "react";

export interface BodyDiffLabels {
  /** Read before an added block or words, e.g. "Added". */
  added: string;
  /** Read before a removed block or words, e.g. "Removed". */
  removed: string;
  /** Read before an edited block, e.g. "Edited". */
  changed: string;
  /** The button over a run of unchanged blocks, e.g. "3 unchanged blocks". */
  unchanged: (count: number) => string;
  /** Summary badges, e.g. "+12 words", "−3 words". */
  wordsAdded: (count: number) => string;
  wordsRemoved: (count: number) => string;
  /** Nothing differs. */
  same: string;
}

export interface BodyDiffProps {
  diff: BodyDiffData;
  labels: BodyDiffLabels;
  className?: string;
}

type Run = { kind: "same"; blocks: string[] } | { kind: "change"; block: BlockChange };

/** Consecutive unchanged blocks fold into one run; every change stands alone. */
function runs(blocks: readonly BlockChange[]): Run[] {
  const out: Run[] = [];
  for (const block of blocks) {
    const last = out.at(-1);
    if (block.kind === "same") {
      if (last?.kind === "same") last.blocks.push(block.markdown);
      else out.push({ kind: "same", blocks: [block.markdown] });
    } else out.push({ kind: "change", block });
  }
  return out;
}

const SOURCE = "whitespace-pre-wrap break-words font-mono text-[0.9em] leading-relaxed";

/**
 * What changed in a markdown body (RFC-0014 §5), on its source: added blocks on a success tint,
 * removed ones struck through on a danger tint, edited ones with the words that changed marked
 * inside. Unchanged blocks fold away. `<ins>`/`<del>` and a hidden word before each change carry
 * the meaning without colour (WCAG 1.4.1).
 */
export function BodyDiff({ diff, labels, className }: BodyDiffProps) {
  const changes = diff.counts.added + diff.counts.removed + diff.counts.changed;
  return (
    <div className={cn("grid min-w-0 gap-2", className)} data-body-diff="">
      <div className="flex flex-wrap items-center gap-1.5">
        {changes === 0 ? (
          <Text variant="secondary" size="sm">
            {labels.same}
          </Text>
        ) : (
          <>
            <Badge variant="success">{labels.wordsAdded(diff.words.added)}</Badge>
            <Badge variant="error">{labels.wordsRemoved(diff.words.removed)}</Badge>
          </>
        )}
      </div>
      {changes > 0 && (
        <div className="grid min-w-0 gap-1.5">
          {runs(diff.blocks).map((run, i) =>
            run.kind === "same" ? (
              // biome-ignore lint/suspicious/noArrayIndexKey: runs have no identity beyond their order.
              <UnchangedRun key={i} blocks={run.blocks} labels={labels} />
            ) : (
              // biome-ignore lint/suspicious/noArrayIndexKey: runs have no identity beyond their order.
              <ChangedBlock key={i} block={run.block} labels={labels} />
            ),
          )}
        </div>
      )}
    </div>
  );
}

function UnchangedRun({ blocks, labels }: { blocks: string[]; labels: BodyDiffLabels }) {
  const [open, setOpen] = useState(false);
  if (open)
    return (
      <div className={cn(SOURCE, "rounded-md px-3 py-1.5 text-kumo-subtle")} data-change="same">
        {blocks.join("\n\n")}
      </div>
    );
  return (
    <div>
      <Button
        variant="ghost"
        size="xs"
        icon={<CaretDown />}
        aria-expanded={false}
        onClick={() => setOpen(true)}
      >
        {labels.unchanged(blocks.length)}
      </Button>
    </div>
  );
}

function ChangedBlock({ block, labels }: { block: BlockChange; labels: BodyDiffLabels }) {
  if (block.kind === "added")
    return (
      <ins
        className={cn(SOURCE, "block rounded-md bg-kumo-success-tint px-3 py-1.5 no-underline")}
        data-change="added"
      >
        <span className="sr-only">{labels.added}: </span>
        {block.markdown}
      </ins>
    );
  if (block.kind === "removed")
    return (
      <del
        className={cn(SOURCE, "block rounded-md bg-kumo-danger-tint px-3 py-1.5 text-kumo-subtle")}
        data-change="removed"
      >
        <span className="sr-only">{labels.removed}: </span>
        {block.markdown}
      </del>
    );
  if (block.kind !== "changed") return null;
  return (
    <div className={cn(SOURCE, "rounded-md bg-kumo-recessed px-3 py-1.5")} data-change="changed">
      <span className="sr-only">{labels.changed}: </span>
      {block.words.map((w, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: word runs have no identity beyond their order.
        <Fragment key={i}>
          {w.kind === "same" ? (
            w.text
          ) : w.kind === "added" ? (
            <ins className="rounded-sm bg-kumo-success-tint no-underline">
              <span className="sr-only">{labels.added}: </span>
              {w.text}
            </ins>
          ) : (
            <del className="rounded-sm bg-kumo-danger-tint text-kumo-subtle">
              <span className="sr-only">{labels.removed}: </span>
              {w.text}
            </del>
          )}
        </Fragment>
      ))}
    </div>
  );
}
