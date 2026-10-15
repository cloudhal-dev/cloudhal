import { Loader, Text } from "@cloudflare/kumo";
import { CheckCircle, Sparkle, User, WarningCircle } from "@phosphor-icons/react";

/** One line of a Build chat (RFC-0020 §6). */
export interface BuildChatItem {
  id: string;
  /**
   * `person`: what they asked; `model`: the model's note; `progress`: what is being written now;
   * `result`: a turn's outcome; `error`: why a turn stopped.
   */
  role: "person" | "model" | "progress" | "result" | "error";
  text: string;
  /** Refused parts or repairs, in mono. */
  details?: readonly string[];
}

export interface BuildChatLogProps {
  items: readonly BuildChatItem[];
  /** Accessible name of the log. */
  label: string;
}

function RoleIcon({ role }: { role: BuildChatItem["role"] }) {
  switch (role) {
    case "person":
      return <User size={16} className="text-kumo-subtle" aria-hidden />;
    case "model":
      return <Sparkle size={16} className="text-kumo-brand" aria-hidden />;
    case "progress":
      return <Loader size="sm" />;
    case "result":
      return <CheckCircle size={16} className="text-kumo-success" aria-hidden />;
    case "error":
      return <WarningCircle size={16} className="text-kumo-danger" aria-hidden />;
  }
}

/**
 * The transcript of Studio's Build chat (RFC-0020 §6, DESIGN.md §2ac), oldest first: the person's
 * briefs, the model's notes, a live line naming what is being written, each turn's outcome and
 * errors. Render it inside a `SectionCard`, above the composer.
 */
export function BuildChatLog({ items, label }: BuildChatLogProps) {
  return (
    <ol className="grid gap-3" aria-live="polite" aria-label={label} data-testid="build-chat">
      {items.map((item) => (
        <li key={item.id} className="flex items-start gap-2" data-role={item.role}>
          <span className="flex h-lh items-center">
            <RoleIcon role={item.role} />
          </span>
          <div className="grid min-w-0 gap-1">
            <Text
              as="span"
              bold={item.role === "person"}
              variant={item.role === "progress" ? "secondary" : "body"}
            >
              {item.text}
            </Text>
            {item.details?.map((d) => (
              <span key={d} className="break-words">
                <Text variant="mono-secondary" as="span">
                  {d}
                </Text>
              </span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
