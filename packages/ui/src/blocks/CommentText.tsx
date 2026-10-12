import { cn, Link, Text } from "@cloudflare/kumo";
import { useMemo } from "react";
import { type CommentTextSegment, parseCommentText } from "./comment-model.ts";

export interface CommentTextProps {
  /** The comment's plain text (`body.text`). Never HTML: markup stays literal text. */
  text: string;
  /**
   * Show at most this many lines (a queue excerpt: 2); the full text belongs in a `Tooltip` or the
   * thread view. Line and paragraph breaks fold into spaces; overflow ends with an ellipsis.
   */
  clamp?: number;
  /** Screen-reader hint appended to every link ("opens in a new tab"). */
  newTabLabel?: string;
  /** Muted text (a hidden or spam comment shown to moderators). */
  muted?: boolean;
  className?: string;
}

const CLAMP: Record<number, string> = {
  1: "line-clamp-1",
  2: "line-clamp-2",
  3: "line-clamp-3",
  4: "line-clamp-4",
};

function Segment({ s, newTabLabel }: { s: CommentTextSegment; newTabLabel?: string | undefined }) {
  if (s.kind === "text") return s.text;
  // `render` keeps the anchor native: an external URL must not go through the app router.
  return (
    <Link
      render={(props) => <a {...props} href={s.href} />}
      target="_blank"
      rel="ugc nofollow noopener noreferrer"
      className="inline wrap-anywhere"
      data-comment-link
    >
      {s.text}
      {newTabLabel && <span className="sr-only"> ({newTabLabel})</span>}
    </Link>
  );
}

/**
 * A comment's text exactly as the public page shows it (RFC-0007 §8.1, §14): paragraphs on blank
 * lines, line breaks kept, only `https:` URLs turned into links (`rel="ugc nofollow noopener
 * noreferrer"`, new tab), everything else — `http:`, `www.`, `javascript:`, markup — plain text.
 * Rendered as React text nodes, never `innerHTML`. `dir="auto"` lets right-to-left comments read
 * right. Used for the queue's excerpt (`clamp={2}`), the thread, the approval dialog and the staff
 * reply preview.
 */
export function CommentText({ text, clamp, newTabLabel, muted, className }: CommentTextProps) {
  const paragraphs = useMemo(() => parseCommentText(text), [text]);
  const clampClass = clamp ? (CLAMP[clamp] ?? "line-clamp-4") : undefined;
  const lines = (p: CommentTextParagraph) =>
    p.map((line, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their order.
      <span key={i}>
        {i > 0 && <br />}
        {line.map((s, j) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their order.
          <Segment key={j} s={s} newTabLabel={newTabLabel} />
        ))}
      </span>
    ));
  if (clampClass) {
    // One clamped block: breaks fold into spaces so two lines carry as much text as they can.
    return (
      <div
        dir="auto"
        data-comment-text
        className={cn("min-w-0 wrap-anywhere", clampClass, className)}
      >
        <Text as="span" variant={muted ? "secondary" : "body"}>
          {paragraphs.flat().map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identity beyond their order.
            <span key={i}>
              {i > 0 && " "}
              {line.map((s, j) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: segments have no identity beyond their order.
                <Segment key={j} s={s} newTabLabel={newTabLabel} />
              ))}
            </span>
          ))}
        </Text>
      </div>
    );
  }
  return (
    <div dir="auto" data-comment-text className={cn("grid min-w-0 gap-2 wrap-anywhere", className)}>
      {paragraphs.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: paragraphs have no identity beyond their order.
        <Text key={i} as="p" variant={muted ? "secondary" : "body"}>
          {lines(p)}
        </Text>
      ))}
    </div>
  );
}

type CommentTextParagraph = ReturnType<typeof parseCommentText>[number];
