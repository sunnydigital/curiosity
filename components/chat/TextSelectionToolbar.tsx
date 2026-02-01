"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitBranch, HelpCircle, Search, MessageSquare, X, Loader2 } from "lucide-react";

interface TextSelectionToolbarProps {
  position: { x: number; y: number };
  selectedText: string;
  messageId: string;
  charStart: number;
  charEnd: number;
  chatId: string;
  onBranch: (
    type: "learn_more" | "dont_understand" | "specifics" | "custom",
    customPrompt?: string
  ) => void;
  onClose: () => void;
}

export function TextSelectionToolbar({
  position,
  selectedText,
  messageId,
  charStart,
  charEnd,
  chatId,
  onBranch,
  onClose,
}: TextSelectionToolbarProps) {
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Close the entire toolbar on Escape when not in custom prompt input
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showCustom) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showCustom, onClose]);

  // Fetch a quick summary of the selected text (skip if too short to be useful)
  useEffect(() => {
    if (!selectedText || !chatId || !messageId) return;

    const controller = new AbortController();
    setSummaryLoading(true);
    setSummary(null);

    fetch(`/api/chat/${chatId}/selection-summary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, charStart, charEnd, selectedText }),
      signal: controller.signal,
    })
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (data?.summary) setSummary(data.summary);
      })
      .catch(() => {})
      .finally(() => setSummaryLoading(false));

    return () => controller.abort();
  }, [selectedText, chatId, messageId, charStart, charEnd]);

  return (
    <div
      className="fixed z-50 flex flex-col gap-1 rounded-lg border bg-popover p-1 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%)",
        minWidth: "520px",
        maxWidth: "560px",
      }}
    >
      {showCustom ? (
        <div className="flex gap-1 p-1">
          <Input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Custom prompt..."
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && customPrompt.trim()) {
                onBranch("custom", customPrompt.trim());
              }
              if (e.key === "Escape") {
                onClose();
              }
            }}
          />
          <Button
            size="sm"
            className="h-7"
            onClick={() => {
              if (customPrompt.trim()) onBranch("custom", customPrompt.trim());
            }}
          >
            <GitBranch className="h-3 w-3" />
          </Button>
        </div>
      ) : (
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onBranch("learn_more")}
          >
            <Search className="h-3 w-3" />
            Learn More
            <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">
              Ctrl+1
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onBranch("dont_understand")}
          >
            <HelpCircle className="h-3 w-3" />
            Explain
            <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">
              Ctrl+2
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => onBranch("specifics")}
          >
            <MessageSquare className="h-3 w-3" />
            Specifics
            <kbd className="ml-1 rounded bg-muted px-1 text-[10px]">
              Ctrl+3
            </kbd>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setShowCustom(true)}
          >
            Custom...
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={onClose}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Quick summary from lightweight model */}
      {(summaryLoading || summary) && (
        <div className="border-t border-border px-2 py-1.5 text-xs text-muted-foreground">
          {summaryLoading ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Summarizing...
            </span>
          ) : (
            summary
          )}
        </div>
      )}
    </div>
  );
}
