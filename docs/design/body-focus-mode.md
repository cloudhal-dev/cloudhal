# Focus mode for the body editor — research and decision

The owner asked for a focus button in Studio's body editor (2026-10-17). Sources at the end.

## What established editors do
| Editor | What focus hides | Dimming | Shortcut | Remembered |
|---|---|---|---|---|
| WordPress (Distraction free) | Closes sidebars; the top toolbar fades and returns on hover; hides the block toolbar and most "+" inserters (blocks come from `/`) | Separate **Spotlight** mode dims every block but the current one | ⇧⌘\\ / Ctrl+Shift+\\ | Per browser (localStorage) |
| iA Writer (Focus Mode) | The app is already bare; focus is about the text | **Sentence** or **paragraph** stays lit, the rest dims | ⌘D | Yes |
| iA Writer / Typora (Typewriter) | — | — | View menu | Yes; iA advises turning it off while editing (selections make the screen jump) |
| Typora (Focus) | — | Everything but the current block fades | View menu | Yes |
| Obsidian (plugins) | Full screen writing | Current line or paragraph dimming, typewriter scroll, limited line length | e.g. F8 / F9 | Yes |

What writers expect from all of them: one click or one shortcut in and out, the words and the formatting tools still there, nothing else on screen, the choice remembered, and never losing track of whether the work is saved.

## Decision (shipped)
- A **Focus** button in the body editor's header row (and **Ctrl/⌘+Shift+\\**, WordPress' convention, from inside the editor) turns the editor into a full-screen writing layer: a readable column (`max-w-3xl`), the formatting toolbar and mode switch in a sticky top bar, everything else of Studio out of view.
- **The save stays at hand**: the host passes `focusActions`; the article editor shows "Unsaved changes / All changes saved" and its Save button in the layer's top bar.
- **Spotlight** (a switch in the layer) dims every top-level block except the one being written (Tiptap's Focus extension, `has-focus`); remembered per browser (`cloudhal.editor.spotlight`, storage failures ignored). No transition under reduced motion.
- **Leaving**: Esc (unless the slash menu took it), the "Leave focus" button or the shortcut; focus returns to the Focus button.
- **Accessibility**: the layer is a modal `dialog` named after the editor; everything outside it is `inert` while it is open (Tab and screen readers stay inside); the button carries `aria-pressed` and the shortcut as its title.
- **Never automatic**: focus mode is entered on request only, never restored on page load (opening an article in a full-screen layer would surprise); only the spotlight preference is remembered.
- Markdown mode works inside the layer too.

## Later
- **Typewriter scrolling** (keep the caret line at a fixed height): useful for long drafts, but it fights selection while editing (iA's own warning); add as an opt-in switch if writers ask.
- ~~Page editor sections~~: done — the page editor provides its save through `FocusSaveContext`, so its rich-text sections show the same save state and Save in focus mode.
- Word count and reading time in the layer's top bar.

## Sources
- WordPress, Distraction Free mode: https://wordpress.org/documentation/article/distraction-free-mode/
- iA Writer, Focus Mode: https://ia.net/writer/support/editor/focus-mode
- Typora, Focus Mode and Typewriter Mode: https://support.typora.io/Focus-and-Typewriter-Mode
- Obsidian Typewriter Mode plugin: https://github.com/davisriedel/obsidian-typewriter-mode
