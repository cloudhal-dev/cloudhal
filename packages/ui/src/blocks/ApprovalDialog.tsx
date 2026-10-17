import { Button, Dialog, Text } from "@cloudflare/kumo";
import type { ReactNode } from "react";

export interface ApprovalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode | undefined;
  /** The confirm button's words (from the screen's catalog). */
  confirmLabel: string;
  /** The cancel button's words. */
  cancelLabel: string;
  destructive?: boolean | undefined;
  busy?: boolean | undefined;
  onConfirm: () => void | Promise<void>;
  children?: ReactNode | undefined;
}

/**
 * The human-approval step for publish / rollback. Agents hit the same gate through the MCP
 * server's elicitation flow (ADR-0004); this is the Studio face of it. Always rendered (Kumo rule
 * `dialog-rendering`); visibility is controlled by `open`.
 */
export function ApprovalDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  busy,
  onConfirm,
  children,
}: ApprovalDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog size="sm" className="p-6">
        <div className="grid gap-1.5">
          <Dialog.Title className="font-semibold text-kumo-default text-lg">{title}</Dialog.Title>
          {description && (
            <Dialog.Description>
              <Text variant="secondary" as="span">
                {description}
              </Text>
            </Dialog.Description>
          )}
        </div>
        {children && <div className="mt-4">{children}</div>}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "primary"}
            onClick={() => void onConfirm()}
            loading={busy}
            data-testid="approve"
          >
            {confirmLabel}
          </Button>
        </div>
      </Dialog>
    </Dialog.Root>
  );
}
