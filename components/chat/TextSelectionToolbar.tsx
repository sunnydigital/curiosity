"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GitBranch, X, Loader2, Plus } from "lucide-react";

/** Rotating palette for the shortcut kbd badges */
const KBD_COLORS = [
  "bg-red-500/20 text-red-400 border-red-500/30",
  "bg-green-500/20 text-green-400 border-green-500/30",
  "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "bg-orange-500/20 text-orange-400 border-orange-500/30",
];

export interface Shortcut {
  id: string;
  label: string;
  prompt: string;
  /** When set, uses a built-in branchType instead of "custom" */
  builtinType?: "learn_more" | "dont_understand" | "specifics";
}

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { id: "learn_more", label: "Learn More", prompt: "I want to learn more about: ", builtinType: "learn_more" },
  { id: "dont_understand", label: "Explain", prompt: "I don't understand: ", builtinType: "dont_understand" },
  { id: "specifics", label: "Specifics", prompt: "What are the specifics of: ", builtinType: "specifics" },
];

const STORAGE_KEY = "curiositylm-shortcuts";

export function loadShortcuts(): Shortcut[] {
  if (typeof window === "undefined") return DEFAULT_SHORTCUTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return DEFAULT_SHORTCUTS;
}

export function saveShortcuts(shortcuts: Shortcut[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(shortcuts));
  } catch { /* ignore */ }
}

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
  const [shortcuts, setShortcuts] = useState<Shortcut[]>(() => loadShortcuts());
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Persist whenever shortcuts change
  useEffect(() => {
    saveShortcuts(shortcuts);
  }, [shortcuts]);

  // Close the entire toolbar on Escape when not in an input
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showCustom && !showAddForm) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showCustom, showAddForm, onClose]);

  // Fetch a quick summary after user settles on a selection (1s debounce)
  useEffect(() => {
    if (!selectedText?.trim() || !chatId || !messageId) return;

    let cancelled = false;
    setSummary(null);
    setSummaryLoading(false);

    const timer = setTimeout(() => {
      if (cancelled) return;
      setSummaryLoading(true);

      (async () => {
        try {
          const res = await fetch(`/api/chat/${chatId}/selection-summary`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messageId, charStart, charEnd, selectedText }),
          });
          if (cancelled) return;
          if (!res.ok) {
            setSummaryLoading(false);
            return;
          }
          const data = await res.json();
          if (!cancelled && data?.summary) {
            setSummary(data.summary);
          }
        } catch {
          // fetch failed or component unmounted
        }
        if (!cancelled) setSummaryLoading(false);
      })();
    }, 1000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedText, chatId, messageId, charStart, charEnd]);

  const handleShortcutClick = (sc: Shortcut) => {
    if (sc.builtinType) {
      onBranch(sc.builtinType);
    } else {
      onBranch("custom", sc.prompt);
    }
  };

  const handleRemoveShortcut = (id: string) => {
    setShortcuts((prev) => prev.filter((s) => s.id !== id));
  };

  const handleAddShortcut = () => {
    const label = newLabel.trim();
    const prompt = newPrompt.trim();
    if (!label || !prompt) return;
    const id = `custom_${Date.now()}`;
    setShortcuts((prev) => [...prev, { id, label, prompt }]);
    setNewLabel("");
    setNewPrompt("");
    setShowAddForm(false);
  };

  const truncate = (text: string, max: number) =>
    text.length > max ? text.slice(0, max - 1) + "\u2026" : text;

  return (
    <div
      className="fixed z-50 flex flex-col gap-1 rounded-lg border bg-popover p-1 shadow-lg"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: "translate(-50%, -100%)",
        minWidth: "520px",
        maxWidth: "620px",
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {showCustom ? (
        <form
          className="flex gap-1 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (customPrompt.trim()) {
              onBranch("custom", customPrompt.trim());
            }
          }}
        >
          <Input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="Custom prompt..."
            className="h-7 text-xs"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                onClose();
              }
            }}
          />
          <Button type="submit" size="sm" className="h-7">
            <GitBranch className="h-3 w-3" />
          </Button>
        </form>
      ) : showAddForm ? (
        <form
          className="flex flex-col gap-1 p-1"
          onSubmit={(e) => {
            e.preventDefault();
            handleAddShortcut();
          }}
        >
          <div className="flex gap-1">
            <Input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="Label (e.g. Summarize)"
              className="h-7 text-xs"
              autoFocus
              maxLength={20}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowAddForm(false);
                }
              }}
            />
            <Input
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Prompt prefix (e.g. Summarize this: )"
              className="h-7 text-xs"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  setShowAddForm(false);
                }
              }}
            />
          </div>
          <div className="flex gap-1 justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-6 text-xs">
              Add
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap gap-1">
          {shortcuts.map((sc, idx) => (
            <div key={sc.id} className="relative group/sc">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs pr-2"
                onClick={() => handleShortcutClick(sc)}
              >
                {truncate(sc.label, 20)}
                <kbd
                  className={`ml-1 rounded border px-1 text-[10px] ${KBD_COLORS[idx % KBD_COLORS.length]}`}
                >
                  Ctrl+{idx + 1}
                </kbd>
              </Button>
              {/* Red X to remove */}
              <button
                type="button"
                className="absolute -right-1 -top-1 hidden group-hover/sc:flex h-3.5 w-3.5 items-center justify-center rounded-full bg-red-500 text-white text-[8px] leading-none hover:bg-red-600"
                onClick={(e) => {
                  e.stopPropagation();
                  handleRemoveShortcut(sc.id);
                }}
              >
                &times;
              </button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="h-3 w-3" />
            Add
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
