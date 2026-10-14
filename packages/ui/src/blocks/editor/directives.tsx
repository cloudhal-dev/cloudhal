/**
 * Body directives in the editor (RFC-0015 §8, phase 6b): `::name{…}` leaves and `:::name{…}` …
 * `:::` containers as nodes. A directive shows as a framed block with its type's icon and title, a
 * "Properties" popover holding the form generated from the type's schema (`BlockPropsForm`), and,
 * for a container, its inner text edited in place.
 *
 * The markdown is the codec's (`codec.ts`): untouched directives keep their bytes, attributes are
 * written by `writeDirective`. A type the host does not list (a theme's type that is gone) shows
 * as "Unknown block" with its attributes, and is saved unchanged.
 */
import { Badge, Button, Popover, Text } from "@cloudflare/kumo";
import { type BlockType, localized, validateProps } from "@cloudhal/core-ts/blocks";
import { directiveAttrsText, directiveProps, writeDirective } from "@cloudhal/core-ts/directives";
import { PencilSimple, SlidersHorizontal } from "@phosphor-icons/react";
import { Node } from "@tiptap/core";
import {
  NodeViewContent,
  NodeViewWrapper,
  type ReactNodeViewProps,
  ReactNodeViewRenderer,
} from "@tiptap/react";
import { createContext, useContext, useState } from "react";
import { BlockPropsForm, type BlockPropsFormLabels } from "../BlockPropsForm.tsx";
import { blockIcon } from "../blockIcon.ts";
import { InsetPanel } from "../InsetPanel.tsx";

/** The editor's words for blocks; Studio passes them through `useT()`. */
export interface DirectiveLabels extends BlockPropsFormLabels {
  /** The button that opens a block's form, e.g. "Properties". */
  properties: string;
  /** A block whose type is not listed, e.g. "Unknown block · {type}". */
  unknown: string;
  unknownHint: string;
  /** Badge on a block whose properties do not fit its type, e.g. "Check properties". */
  invalid: string;
  /** Opens an unknown block in Markdown mode, e.g. "Edit as Markdown". */
  editSource?: string;
}

/** What directive nodes need from the host: the body block types and the words. */
export interface EditorBlocks {
  /** Block types allowed in bodies (`registry.list("body")`). */
  types: readonly BlockType[];
  labels: DirectiveLabels;
  /** Words for enum values (`tone` → `warning`). */
  enumLabel?: (prop: string, value: string) => string;
}

interface DirectiveContextValue extends EditorBlocks {
  locale: string;
  onEditSource?: ((markdown: string) => void) | undefined;
}

/** Provided by `MarkdownEditor` around its content; node views read it. */
export const DirectiveContext = createContext<DirectiveContextValue | undefined>(undefined);

type Props = Record<string, unknown>;

/** A short line of what the block says (its first text props), for the frame's header. */
function summaryOf(type: BlockType, props: Props): string {
  return Object.entries(type.props.properties)
    .filter(
      ([key, s]) =>
        s.type === "string" && !("enum" in s && s.enum) && typeof props[key] === "string",
    )
    .map(([key]) => String(props[key]))
    .filter(Boolean)
    .slice(0, 2)
    .join(" · ");
}

function DirectiveView({ node, updateAttributes, editor }: ReactNodeViewProps) {
  const ctx = useContext(DirectiveContext);
  const [open, setOpen] = useState(false);
  const name = String(node.attrs.name ?? "");
  const raw = (node.attrs.props ?? {}) as Props;
  const container = node.type.name === "directiveContainer";
  const type = ctx?.types.find((t) => t.name === name && t.where.includes("body"));
  const props = directiveProps(type, raw);
  const issues = type ? validateProps(type.props, props) : [];
  const Icon = blockIcon(type);
  const labels = ctx?.labels;
  const title = type
    ? localized(type.title, ctx?.locale ?? "en")
    : (labels?.unknown ?? "Unknown block · {type}").replace("{type}", name);
  const summary = type ? summaryOf(type, props) : directiveAttrsText(raw);
  return (
    <NodeViewWrapper data-directive={name} data-directive-known={type ? "" : undefined}>
      <InsetPanel label={title} className="my-3">
        <div className="grid min-w-0 gap-2">
          <div contentEditable={false} className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex items-center text-kumo-subtle">
              <Icon />
            </span>
            <Text bold as="span">
              {title}
            </Text>
            {summary && (
              <span className="min-w-0 flex-1 truncate">
                <Text variant="secondary" size="sm" as="span">
                  {summary}
                </Text>
              </span>
            )}
            {issues.length > 0 && labels && <Badge variant="warning">{labels.invalid}</Badge>}
            {type && labels && (
              <Popover open={open} onOpenChange={setOpen}>
                <Popover.Trigger
                  render={
                    <Button
                      variant="ghost"
                      size="xs"
                      icon={<SlidersHorizontal />}
                      className="ms-auto"
                      data-directive-properties=""
                    >
                      {labels.properties}
                    </Button>
                  }
                />
                <Popover.Content
                  align="end"
                  positionMethod="fixed"
                  className="grid max-h-[70vh] w-80 gap-3 overflow-y-auto"
                >
                  <Popover.Title>{title}</Popover.Title>
                  <BlockPropsForm
                    schema={type.props}
                    value={props}
                    onChange={(next) => updateAttributes({ props: next })}
                    issues={issues}
                    locale={ctx?.locale ?? "en"}
                    labels={labels}
                    disabled={!editor.isEditable}
                    {...(ctx?.enumLabel ? { enumLabel: ctx.enumLabel } : {})}
                  />
                </Popover.Content>
              </Popover>
            )}
            {!type && ctx?.onEditSource && labels?.editSource && editor.isEditable && (
              <Button
                variant="ghost"
                size="xs"
                icon={<PencilSimple />}
                className="ms-auto"
                onClick={() =>
                  ctx.onEditSource?.(writeDirective(name, raw, container ? "" : undefined))
                }
              >
                {labels.editSource}
              </Button>
            )}
          </div>
          {!type && labels && (
            <Text variant="secondary" size="sm">
              {labels.unknownHint}
            </Text>
          )}
          {container && <NodeViewContent className="min-w-0" />}
        </div>
      </InsetPanel>
    </NodeViewWrapper>
  );
}

const attributes = () => ({
  name: { default: "" },
  props: { default: {} },
});

/** `::name{…}`: a block with no inner text. */
export const DirectiveLeaf = Node.create({
  name: "directiveLeaf",
  group: "block",
  atom: true,
  selectable: true,
  draggable: false,
  addAttributes: attributes,
  parseHTML() {
    return [{ tag: "div[data-directive-leaf]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-directive-leaf": String(node.attrs.name ?? "") }];
  },
  renderMarkdown(node) {
    return writeDirective(String(node.attrs?.name ?? ""), (node.attrs?.props ?? {}) as Props);
  },
  addNodeView() {
    return ReactNodeViewRenderer(DirectiveView);
  },
});

/**
 * `:::name{…}` … `:::`: a block wrapping markdown. `base` holds what the codec needs to keep the
 * untouched inner blocks' bytes (`codec.ts`); it is never rendered.
 */
export const DirectiveContainer = Node.create({
  name: "directiveContainer",
  group: "block",
  content: "block+",
  defining: true,
  isolating: true,
  draggable: false,
  addAttributes() {
    return { ...attributes(), base: { default: null, rendered: false } };
  },
  parseHTML() {
    return [{ tag: "div[data-directive-container]" }];
  },
  renderHTML({ node }) {
    return ["div", { "data-directive-container": String(node.attrs.name ?? "") }, 0];
  },
  renderMarkdown(node, helpers) {
    const inner = (node.content ?? []).map((child) => helpers.renderChildren([child]).trimEnd());
    return writeDirective(
      String(node.attrs?.name ?? ""),
      (node.attrs?.props ?? {}) as Props,
      inner.filter(Boolean).join("\n\n"),
    );
  },
  addNodeView() {
    return ReactNodeViewRenderer(DirectiveView);
  },
});
