/**
 * The slash menu's engine: typing `/` at the start of a block or after a space opens a list of
 * blocks to insert, filtered by what follows. `@tiptap/suggestion` (MIT) finds the trigger; the
 * list itself is React (`SlashMenu` in `MarkdownEditor.tsx`), fed through `onState`.
 */
import { type Editor, Extension, type Range } from "@tiptap/core";
import { PluginKey } from "@tiptap/pm/state";
import Suggestion, { exitSuggestion, type SuggestionMount } from "@tiptap/suggestion";

export interface SlashItem {
  key: string;
  label: string;
  /** Extra words that find the item (its English name, synonyms). */
  keywords: readonly string[];
  run: (editor: Editor) => void;
}

/** What the open menu shows; `null` when closed. */
export interface SlashState {
  items: SlashItem[];
  index: number;
  /** Places the list under the `/` and keeps it there (scrolling, resizing); returns cleanup. */
  mount: SuggestionMount;
  choose: (item: SlashItem) => void;
  hover: (index: number) => void;
}

export interface SlashOptions {
  items: () => readonly SlashItem[];
  onState: (state: SlashState | null) => void;
  /** Turkish-aware matching (`tr` lower-cases İ and I correctly). */
  locale?: string;
}

/** Items whose label, key or keywords start with (or contain) the query, best first. */
export function filterSlashItems(
  items: readonly SlashItem[],
  query: string,
  locale = "en",
): SlashItem[] {
  const q = query.trim().toLocaleLowerCase(locale);
  if (!q) return [...items];
  const words = (item: SlashItem) =>
    [item.label, item.key, ...item.keywords].map((w) => w.toLocaleLowerCase(locale));
  const starts = items.filter((i) =>
    words(i).some((w) => w.split(/\s+/).some((p) => p.startsWith(q))),
  );
  const contains = items.filter((i) => !starts.includes(i) && words(i).some((w) => w.includes(q)));
  return [...starts, ...contains];
}

const key = new PluginKey("cloudhalSlash");

export const SlashCommand = Extension.create<SlashOptions>({
  name: "slashCommand",
  addOptions() {
    return { items: () => [], onState: () => {}, locale: "en" };
  },
  addProseMirrorPlugins() {
    const options = this.options;
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: key,
        char: "/",
        allowSpaces: false,
        placement: "bottom-start",
        offset: { mainAxis: 6 },
        flip: true,
        floatingUi: { strategy: "fixed" },
        // Not inside code, where `/` is just a character.
        allow: ({ editor }) => !editor.isActive("codeBlock") && !editor.isActive("code"),
        items: ({ query }) => filterSlashItems(options.items(), query, options.locale),
        command: ({ editor, range, props }: { editor: Editor; range: Range; props: SlashItem }) => {
          editor.chain().focus().deleteRange(range).run();
          props.run(editor);
        },
        render: () => {
          let items: SlashItem[] = [];
          let index = 0;
          let mount: SuggestionMount = () => () => {};
          let command: (item: SlashItem) => void = () => {};
          const publish = () =>
            options.onState({
              items,
              index,
              mount,
              choose: (item) => command(item),
              hover: (i) => {
                index = i;
                publish();
              },
            });
          const take = (props: {
            items: SlashItem[];
            command: (item: SlashItem) => void;
            mount: SuggestionMount;
          }) => {
            items = props.items;
            command = props.command;
            mount = props.mount;
            index = Math.min(index, Math.max(items.length - 1, 0));
            publish();
          };
          return {
            onStart: (props) => {
              index = 0;
              take(props);
            },
            onUpdate: (props) => {
              index = 0;
              take(props);
            },
            onKeyDown: ({ event, view }) => {
              if (event.key === "Escape") {
                // Dismissed until the `/` is typed again (the plugin remembers the range).
                exitSuggestion(view, key);
                return true;
              }
              if (!items.length) return false;
              if (event.key === "ArrowDown") {
                index = (index + 1) % items.length;
                publish();
                return true;
              }
              if (event.key === "ArrowUp") {
                index = (index - 1 + items.length) % items.length;
                publish();
                return true;
              }
              if (event.key === "Enter" || event.key === "Tab") {
                const item = items[index];
                if (item) command(item);
                return true;
              }
              return false;
            },
            onExit: () => options.onState(null),
          };
        },
      }),
    ];
  },
});
