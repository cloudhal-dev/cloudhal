/** The link control: add, change or remove the link on the selection (allowed schemes only). */
import { Button, cn, Input, Popover, Toolbar } from "@cloudflare/kumo";
import { LinkSimple } from "@phosphor-icons/react";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { allowedHref } from "./extensions.tsx";
import type { MarkdownEditorLabels } from "./types.ts";

export function LinkButton({
  editor,
  labels,
  active,
  onOpenChange,
}: {
  editor: Editor;
  labels: MarkdownEditorLabels;
  active: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const [href, setHref] = useState("");
  const [invalid, setInvalid] = useState(false);
  const openWith = (next: boolean) => {
    if (next) {
      setHref(String(editor.getAttributes("link").href ?? ""));
      setInvalid(false);
    }
    setOpen(next);
    onOpenChange?.(next);
  };
  const apply = () => {
    const url = href.trim();
    if (!url || !allowedHref(url)) {
      setInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    openWith(false);
  };
  const remove = () => {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    openWith(false);
  };
  return (
    <Popover open={open} onOpenChange={openWith}>
      <Popover.Trigger
        render={
          <Toolbar.Button
            icon={<LinkSimple />}
            aria-label={labels.link}
            title={labels.link}
            aria-pressed={active}
            data-format="link"
            className={cn(active && "bg-kumo-tint")}
            onMouseDown={(e) => e.preventDefault()}
          />
        }
      />
      <Popover.Content align="start" positionMethod="fixed" className="grid w-80 gap-3">
        <Popover.Title>{labels.linkTitle}</Popover.Title>
        <Input
          label={labels.linkUrl}
          value={href}
          onValueChange={(v) => {
            setHref(v);
            setInvalid(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              apply();
            }
          }}
          error={invalid ? labels.linkInvalid : undefined}
          className="w-full font-mono"
          autoFocus
        />
        <div className="flex justify-end gap-2">
          {active && (
            <Button variant="secondary" size="sm" onClick={remove}>
              {labels.linkRemove}
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={apply}>
            {labels.linkApply}
          </Button>
        </div>
      </Popover.Content>
    </Popover>
  );
}
