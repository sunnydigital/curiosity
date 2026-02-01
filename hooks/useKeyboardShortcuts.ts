"use client";

import { useEffect, useCallback } from "react";
import type { Shortcut } from "@/components/chat/TextSelectionToolbar";

interface UseKeyboardShortcutsOptions {
  shortcuts: Shortcut[];
  onBranch: (
    type: "learn_more" | "dont_understand" | "specifics" | "custom",
    selectedText: string,
    messageId: string,
    charStart: number,
    charEnd: number,
    customPrompt?: string
  ) => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  shortcuts,
  onBranch,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (!e.ctrlKey && !e.metaKey) return;

      // Map key "1"–"9" to shortcut index 0–8
      const num = parseInt(e.key, 10);
      if (isNaN(num) || num < 1 || num > shortcuts.length) return;

      const sc = shortcuts[num - 1];
      if (!sc) return;

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) return;

      const text = selection.toString().trim();
      if (!text) return;

      // Find which message the selection is in
      // Match "message-{uuid}" but not "message-content-{uuid}"
      const range = selection.getRangeAt(0);
      let container = range.startContainer as HTMLElement;
      while (
        container &&
        !(container.id?.startsWith("message-") && !container.id?.startsWith("message-content-"))
      ) {
        container = container.parentElement as HTMLElement;
      }
      if (!container) return;

      const messageId = container.id.replace("message-", "");

      // Calculate offsets
      const preRange = document.createRange();
      preRange.setStart(container, 0);
      preRange.setEnd(range.startContainer, range.startOffset);
      const charStart = preRange.toString().length;
      const charEnd = charStart + text.length;

      e.preventDefault();

      if (sc.builtinType) {
        onBranch(sc.builtinType, text, messageId, charStart, charEnd);
      } else {
        onBranch("custom", text, messageId, charStart, charEnd, sc.prompt);
      }
    },
    [enabled, onBranch, shortcuts]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
