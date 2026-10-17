/**
 * Focus mode: the editor alone on the screen, entered only on request (never on page load). While
 * on, the page behind does not scroll and is inert; Esc and Ctrl/⌘+Shift+\ leave.
 */
import type { Editor } from "@tiptap/core";
import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { SlashState } from "./slash.ts";

export function useFocusMode({
  rootRef,
  editorRef,
  canFocus,
  slash,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  editorRef: RefObject<Editor | null>;
  /** The host gave focus mode a label; without one there is no focus mode. */
  canFocus: boolean;
  /** An open `/` menu takes Esc first. */
  slash: SlashState | null;
}) {
  const [focused, setFocused] = useState(false);
  const focusButton = useRef<HTMLButtonElement>(null);
  const leaveFocus = useCallback(() => {
    setFocused(false);
    // Back where the person left from.
    requestAnimationFrame(() => focusButton.current?.focus());
  }, []);
  const toggleFocus = useCallback(() => {
    if (focused) leaveFocus();
    else {
      setFocused(true);
      requestAnimationFrame(() => editorRef.current?.commands.focus());
    }
  }, [focused, leaveFocus, editorRef.current?.commands.focus]);
  // While focused: the page behind does not scroll, and Esc leaves (unless a menu or popover of
  // the editor took it first).
  useEffect(() => {
    if (!focused) return;
    const root = document.documentElement;
    const before = root.style.overflow;
    root.style.overflow = "hidden";
    // Everything outside the editor is out of reach (Tab, screen readers) while it covers it.
    const quieted: Element[] = [];
    for (
      let el: HTMLElement | null = rootRef.current;
      el && el !== document.body;
      el = el.parentElement
    )
      for (const sib of el.parentElement?.children ?? [])
        if (sib !== el && !sib.hasAttribute("inert") && sib.tagName !== "SCRIPT") {
          sib.setAttribute("inert", "");
          quieted.push(sib);
        }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented && !slash) leaveFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      root.style.overflow = before;
      for (const el of quieted) el.removeAttribute("inert");
      document.removeEventListener("keydown", onKey);
    };
  }, [focused, slash, leaveFocus, rootRef.current]);
  // Ctrl/⌘+Shift+\ (WordPress' convention) opens and closes focus mode from inside this editor.
  useEffect(() => {
    if (!canFocus) return;
    const onKey = (e: KeyboardEvent) => {
      if (!((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Backslash")) return;
      if (!focused && !rootRef.current?.contains(document.activeElement)) return;
      e.preventDefault();
      toggleFocus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [canFocus, focused, toggleFocus, rootRef.current?.contains]);
  return { focused, focusButton, toggleFocus };
}
