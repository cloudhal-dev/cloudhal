import {
  Banner,
  Button,
  cn,
  Dialog,
  DialogClose,
  DialogRoot,
  DialogTitle,
  Input,
} from "@cloudflare/kumo";
import { Check, Copy, WarningCircle, X } from "@phosphor-icons/react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

// Copied with `kumo add DeleteResource` and owned by Cloudhal. Changes from upstream: `notice`, and
// every word comes from `labels` (upstream hard-codes English; AGENTS.md hard rule 10).

export const KUMO_DELETE_RESOURCE_VARIANTS = {
  size: {
    sm: {
      classes: "",
      description: "Small dialog for simple delete confirmations",
    },
    base: {
      classes: "",
      description: "Default delete confirmation dialog size",
    },
  },
} as const;

export const KUMO_DELETE_RESOURCE_DEFAULT_VARIANTS = {
  size: "base",
} as const;

export type KumoDeleteResourceSize = keyof typeof KUMO_DELETE_RESOURCE_VARIANTS.size;

export interface KumoDeleteResourceVariantsProps {
  size?: KumoDeleteResourceSize;
}

/**
 * The dialog's words, from the screen's catalog. `{name}` is replaced by the resource's name
 * (drawn as a code chip in `warning` and `typeToConfirm`); the screen fills in the resource type.
 */
export interface DeleteResourceLabels {
  /** "Delete {name}" */
  title: string;
  /** "This action cannot be undone. This will permanently delete the {name} page." */
  warning: string;
  /** "Type {name} to confirm:" */
  typeToConfirm: string;
  /** Accessible name of the copy button: "Copy {name} to clipboard". */
  copy: string;
  /** Accessible name of the confirmation input: "Type {name} to confirm deletion". */
  confirmInput: string;
  close: string;
  cancel: string;
  /** The destructive button: "Delete page", "Revoke key". */
  delete: string;
}

export interface DeleteResourceProps extends KumoDeleteResourceVariantsProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when open state changes */
  onOpenChange: (open: boolean) => void;
  /** Every word of the dialog (Cloudhal: replaces upstream's `resourceType` and English text). */
  labels: DeleteResourceLabels;
  /** The name of the specific resource being deleted */
  resourceName: string;
  /** Callback when delete is confirmed */
  onDelete: () => void | Promise<void>;
  /** Whether the delete action is in progress */
  isDeleting?: boolean;
  /** Whether the confirmation input should be case-sensitive (default: true) */
  caseSensitive?: boolean;
  /** Additional className for the dialog */
  className?: string;
  /** Error message to display if the delete action fails */
  errorMessage?: string;
  /** Cloudhal: a consequence to read before confirming (e.g. the menu items that will be hidden). */
  notice?: ReactNode;
}

export function DeleteResource({
  open,
  onOpenChange,
  labels,
  resourceName,
  onDelete,
  isDeleting = false,
  caseSensitive = true,
  size = KUMO_DELETE_RESOURCE_DEFAULT_VARIANTS.size,
  errorMessage,
  notice,
  className,
}: DeleteResourceProps) {
  const [confirmationInput, setConfirmationInput] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setConfirmationInput("");
      setCopied(false);
    }
  }, [open]);

  const normalizeForComparison = useCallback(
    (str: string) => (caseSensitive ? str : str.toLowerCase()),
    [caseSensitive],
  );

  const isConfirmed =
    normalizeForComparison(confirmationInput) === normalizeForComparison(resourceName);

  const handleDelete = useCallback(async () => {
    if (!isConfirmed || isDeleting) return;
    await onDelete();
  }, [isConfirmed, isDeleting, onDelete]);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(resourceName);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [resourceName]);

  return (
    <DialogRoot open={open} onOpenChange={onOpenChange}>
      <Dialog size={size} className={cn("p-0", className)}>
        <div className="flex items-center justify-between border-b border-kumo-line px-6 py-4">
          <DialogTitle className="text-lg font-semibold">
            {fill(labels.title, resourceName)}
          </DialogTitle>
          <DialogClose
            render={(props) => (
              <Button
                {...props}
                variant="ghost"
                shape="square"
                size="sm"
                aria-label={labels.close}
                disabled={isDeleting}
              >
                <X size={18} />
              </Button>
            )}
          />
        </div>

        <div className="flex flex-col gap-4 p-6">
          <div className="flex flex-col gap-2">
            {errorMessage && (
              <Banner icon={<WarningCircle />} variant="error">
                {errorMessage}
              </Banner>
            )}
            <p className="max-w-prose text-base text-pretty text-kumo-subtle">
              {withName(
                labels.warning,
                <span className="font-medium text-kumo-default">{resourceName}</span>,
              )}
            </p>
            {notice}
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-base">
              <span>
                {withName(
                  labels.typeToConfirm,
                  <button
                  className="group inline rounded-md bg-kumo-tint px-2 py-1 font-mono text-sm font-semibold hover:cursor-pointer hover:bg-kumo-fill"
                  onClick={handleCopy}
                  aria-label={fill(labels.copy, resourceName)}
                >
                  {resourceName}

                  {copied ? (
                    <Check size={12} weight="bold" className="ml-1.5 inline" />
                  ) : (
                    <Copy
                      size={12}
                      weight="bold"
                      className="ml-1.5 inline text-kumo-subtle group-hover:text-kumo-default"
                    />
                  )}
                </button>,
                )}
              </span>
            </div>
            <Input
              placeholder={resourceName}
              value={confirmationInput}
              onChange={(e) => setConfirmationInput(e.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              aria-label={fill(labels.confirmInput, resourceName)}
              className="w-full"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-kumo-line px-6 py-4">
          <DialogClose
            render={(props) => (
              <Button {...props} variant="secondary" disabled={isDeleting}>
                {labels.cancel}
              </Button>
            )}
          />
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!isConfirmed || isDeleting}
            loading={isDeleting}
          >
            {labels.delete}
          </Button>
        </div>
      </Dialog>
    </DialogRoot>
  );
}

DeleteResource.displayName = "DeleteResource";

const fill = (template: string, name: string) => template.replaceAll("{name}", name);

/** `template` with its `{name}` drawn as `node` (word order stays the translator's). */
function withName(template: string, node: ReactNode): ReactNode {
  const [before, ...rest] = template.split("{name}");
  if (rest.length === 0) return template;
  return (
    <>
      {before}
      {node}
      {rest.join("")}
    </>
  );
}
