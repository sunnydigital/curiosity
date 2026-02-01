"use client";

import { useEffect, useCallback } from "react";

interface UseKeyboardShortcutsOptions {
  onBranch: (
    type: "learn_more" | "dont_understand" | "specifics",
    selectedText: string,
    messageId: string,
    charStart: number,
    charEnd: number
  ) => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts({
  onBranch,
  enabled = true,
}: UseKeyboardShortcutsOptions) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!enabled) return;
      if (!e.ctrlKey && !e.metaKey) return;

      const branchTypes: Record<string, "learn_more" | "dont_understand" | "specifics"> = {
        "1": "learn_more",
        "2": "dont_understand",
        "3": "specifics",
      };

      const branchType = branchTypes[e.key];
      if (!branchType) return;

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
      onBranch(branchType, text, messageId, charStart, charEnd);
    },
    [enabled, onBranch]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
