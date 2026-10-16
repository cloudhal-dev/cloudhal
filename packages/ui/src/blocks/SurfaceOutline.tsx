/**
 * A generated section (RFC-0020 surface) as people read it: its components as an outline with
 * readable names and what each shows, and the texts a person may change in place. The layout
 * itself is changed by asking an agent (Build chat); the data stays behind "Show JSON" in the
 * screen. Same row language as `MenuTree` (hairline rows, depth guides), without dragging.
 */
import { Badge, Button, cn, Input, InputArea, Text } from "@cloudflare/kumo";
import { CaretDown, CaretRight, PencilSimple } from "@phosphor-icons/react";
import { type ReactNode, useState } from "react";

/** A text a person may change in place (a literal string prop). */
export interface SurfaceOutlineField {
  prop: string;
  label: string;
  value: string;
  multiline?: boolean;
  maxLength?: number;
}

export interface SurfaceOutlineNode {
  id: string;
  /** The component's readable name ("Heading", "Number field"). */
  title: string;
  /** What it shows, in a few words ("How many calories…", "bound to /weight"). */
  summary?: string;
  /** A state, e.g. "Not on the page". */
  status?: ReactNode;
  fields?: SurfaceOutlineField[];
  children?: SurfaceOutlineNode[];
}

export interface SurfaceOutlineLabels {
  /** The outline's accessible name. */
  tree: string;
  expand: (title: string) => string;
  collapse: (title: string) => string;
  /** The row button that opens (and closes) a component's text fields. */
  editTexts: (title: string) => string;
}

export interface SurfaceOutlineProps {
  nodes: SurfaceOutlineNode[];
  labels: SurfaceOutlineLabels;
  /** A text changed in place; absent or `readOnly`: texts are shown, not editable. */
  onField?: (id: string, prop: string, value: string) => void;
  readOnly?: boolean;
  /** Per-row actions (e.g. "Change with AI"). */
  actions?: (node: SurfaceOutlineNode) => ReactNode;
  className?: string;
}

export function SurfaceOutline({
  nodes,
  labels,
  onField,
  readOnly = false,
  actions,
  className,
}: SurfaceOutlineProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Text fields open per row, on demand: a long section stays a readable outline.
  const [editing, setEditing] = useState<ReadonlySet<string>>(new Set());
  const toggleEditing = (id: string) =>
    setEditing((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggle = (id: string) =>
    setCollapsed((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const rows: { node: SurfaceOutlineNode; depth: number }[] = [];
  const walk = (list: SurfaceOutlineNode[], depth: number) => {
    for (const node of list) {
      rows.push({ node, depth });
      if (node.children?.length && !collapsed.has(node.id)) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 1);
  const editable = !readOnly && onField !== undefined;
  return (
    <ul aria-label={labels.tree} className={cn("m-0 grid min-w-0 list-none p-0", className)}>
      {rows.map(({ node, depth }) => {
        const open = !collapsed.has(node.id);
        const hasChildren = Boolean(node.children?.length);
        return (
          <li
            key={node.id}
            data-component-id={node.id}
            className="relative grid min-w-0 gap-2 border-b border-kumo-hairline py-2 pr-3 last:border-b-0"
            style={{ paddingInlineStart: `${0.5 + (depth - 1) * 1.5}rem` }}
          >
            {Array.from({ length: depth - 1 }, (_, level) => (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: one guide per level
                key={level}
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-kumo-hairline"
                style={{ insetInlineStart: `${1.25 + level * 1.5}rem` }}
              />
            ))}
            <div className="flex min-w-0 items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center">
                {hasChildren && (
                  <Button
                    variant="ghost"
                    size="xs"
                    shape="square"
                    aria-label={open ? labels.collapse(node.title) : labels.expand(node.title)}
                    icon={open ? <CaretDown size={12} /> : <CaretRight size={12} />}
                    onClick={() => toggle(node.id)}
                  />
                )}
              </span>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <Text as="span" bold>
                  {node.title}
                </Text>
                {node.summary && (
                  <Text as="span" variant="secondary">
                    <span className="break-words">{node.summary}</span>
                  </Text>
                )}
                <Badge variant="outline">{node.id}</Badge>
                {node.status}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {editable && node.fields?.length ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="square"
                    aria-label={labels.editTexts(node.title)}
                    aria-expanded={editing.has(node.id)}
                    icon={<PencilSimple size={16} />}
                    onClick={() => toggleEditing(node.id)}
                  />
                ) : null}
                {actions?.(node)}
              </div>
            </div>
            {editable && node.fields?.length && editing.has(node.id) ? (
              <div className="grid min-w-0 gap-3 pb-1 pl-8">
                {node.fields.map((f) =>
                  f.multiline ? (
                    <InputArea
                      key={f.prop}
                      label={f.label}
                      value={f.value}
                      maxLength={f.maxLength}
                      autoResize
                      minRows={2}
                      maxRows={8}
                      className="w-full"
                      onValueChange={(value) => onField?.(node.id, f.prop, value)}
                    />
                  ) : (
                    <Input
                      key={f.prop}
                      label={f.label}
                      value={f.value}
                      maxLength={f.maxLength}
                      className="w-full"
                      onValueChange={(value) => onField?.(node.id, f.prop, value)}
                    />
                  ),
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
