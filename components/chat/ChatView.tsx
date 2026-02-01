"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useChat } from "@/hooks/useChat";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TextSelectionToolbar, loadShortcuts } from "./TextSelectionToolbar";
import { ChatActions } from "./ChatActions";
import { TreePanel } from "@/components/tree/TreePanel";
import { MemoryPanel } from "@/components/memory/MemoryPanel";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import type { Message } from "@/types";

// Known Ollama vision model base names (from ollama.com/search?c=vision)
const OLLAMA_VISION_MODELS = [
  "llava", "llava-llama3", "llava-phi3", "bakllava", "moondream",
  "minicpm-v", "llama3.2-vision", "llama4", "gemma3",
  "granite3.2-vision", "qwen2.5vl", "qwen3-vl",
  "mistral-small3.1", "mistral-small3.2", "ministral-3",
  "deepseek-ocr", "translategemma", "devstral-small-2",
];

function modelSupportsImages(provider: string, model: string): boolean {
  // Anthropic and Gemini: all models support vision
  if (provider === "anthropic" || provider === "gemini") return true;
  // OpenAI: GPT-4o, GPT-4-turbo, and o-series support vision; GPT-3.5 does not
  if (provider === "openai") {
    return /gpt-4o|gpt-4-turbo|o1|o3|o4/i.test(model);
  }
  // Ollama: check base name (before the colon/tag) against known vision models
  if (provider === "ollama") {
    const baseName = model.split(":")[0].toLowerCase();
    return OLLAMA_VISION_MODELS.some((v) => baseName === v || baseName.startsWith(v + "-"));
  }
  return false;
}

interface ChatViewProps {
  chatId: string;
}

export function ChatView({ chatId }: ChatViewProps) {
  const {
    messages,
    isLoading,
    streamingContent,
    error,
    activePath,
    fetchMessages,
    sendMessage,
    stopStreaming,
    getPathMessages,
    navigateToBranch,
    setActivePath,
  } = useChat({ chatId });

  const scrollRef = useRef<HTMLDivElement>(null);
  const selectionRangeRef = useRef<Range | null>(null);
  const [showTree, setShowTree] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [chatTitle, setChatTitle] = useState("New Chat");
  const [activeModel, setActiveModel] = useState("");
  const [activeProvider, setActiveProvider] = useState("");
  const [selectionState, setSelectionState] = useState<{
    messageId: string;
    selectedText: string;
    charStart: number;
    charEnd: number;
    position: { x: number; y: number };
  } | null>(null);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts());

  // Re-sync shortcuts from localStorage when toolbar opens (picks up adds/removes)
  useEffect(() => {
    if (selectionState) {
      setShortcuts(loadShortcuts());
    }
  }, [selectionState]);

  useEffect(() => {
    fetchMessages();
    fetch(`/api/chat/${chatId}`)
      .then((r) => r.json())
      .then((data) => { if (data?.title) setChatTitle(data.title); })
      .catch(() => {});
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data?.activeModel) setActiveModel(data.activeModel);
        if (data?.activeProvider) setActiveProvider(data.activeProvider);
      })
      .catch(() => {});
  }, [fetchMessages, chatId]);

  // Listen for tree/memory toggle buttons in TopBar
  useEffect(() => {
    const treeBtn = document.getElementById("tree-toggle-btn");
    const memBtn = document.getElementById("memory-toggle-btn");
    const handleTree = () => setShowTree((v) => !v);
    const handleMem = () => setShowMemory((v) => !v);
    treeBtn?.addEventListener("click", handleTree);
    memBtn?.addEventListener("click", handleMem);
    return () => {
      treeBtn?.removeEventListener("click", handleTree);
      memBtn?.removeEventListener("click", handleMem);
    };
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingContent]);

  const displayMessages = getPathMessages();

  // Compute main trunk IDs for highlighting
  const trunkIds = useMemo(() => {
    const ids = new Set<string>();
    const root = messages.find((m) => !m.parentId);
    if (!root) return ids;
    ids.add(root.id);
    let current = root;
    while (true) {
      const children = messages.filter((m) => m.parentId === current.id);
      const trunkChild = children.find((c) => !c.isBranchRoot);
      if (!trunkChild) break;
      ids.add(trunkChild.id);
      current = trunkChild;
    }
    return ids;
  }, [messages]);

  const activeIds = useMemo(() => {
    if (activePath.length > 0) return new Set(activePath);
    return trunkIds;
  }, [activePath, trunkIds]);

  const getBranches = useCallback(
    (messageId: string): Message[] => {
      return messages.filter(
        (m) => m.branchSourceMessageId === messageId && m.isBranchRoot
      );
    },
    [messages]
  );

  const handleTextSelect = useCallback(
    (params: {
      messageId: string;
      selectedText: string;
      charStart: number;
      charEnd: number;
    }) => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return;
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      // Save a clone of the Range so we can restore it after re-render
      selectionRangeRef.current = range.cloneRange();
      setSelectionState({
        ...params,
        position: {
          x: rect.left + rect.width / 2,
          y: rect.top - 10,
        },
      });
    },
    []
  );

  // Restore the browser selection after re-render so the highlight persists
  // (React re-rendering inline elements like <strong> or KaTeX spans can clear it)
  useLayoutEffect(() => {
    if (selectionState && selectionRangeRef.current) {
      const selection = window.getSelection();
      if (selection) {
        try {
          selection.removeAllRanges();
          selection.addRange(selectionRangeRef.current);
        } catch {
          // Range nodes may have been detached; ignore
        }
      }
    }
  }, [selectionState]);

  const handleBranch = async (
    type: "learn_more" | "dont_understand" | "specifics" | "custom",
    customPrompt?: string
  ) => {
    if (!selectionState) return;

    try {
      const res = await fetch(`/api/chat/${chatId}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          sourceMessageId: selectionState.messageId,
          selectedText: selectionState.selectedText,
          charStart: selectionState.charStart,
          charEnd: selectionState.charEnd,
          branchType: type,
          customPrompt,
        }),
      });

      const data = await res.json();
      await fetchMessages();

      if (data.branchRoot) {
        navigateToBranch(data.branchRoot.id);
      }
    } catch (err) {
      console.error("Branch creation failed:", err);
    }

    setSelectionState(null);
    window.getSelection()?.removeAllRanges();
  };

  // Keyboard shortcuts for branching
  useKeyboardShortcuts({
    shortcuts,
    onBranch: (type, selectedText, messageId, charStart, charEnd, customPrompt) => {
      setSelectionState(null);
      // Directly create branch
      fetch(`/api/chat/${chatId}/branch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chatId,
          sourceMessageId: messageId,
          selectedText,
          charStart,
          charEnd,
          branchType: type,
          customPrompt,
        }),
      })
        .then((r) => r.json().catch(() => null))
        .then(async (data) => {
          if (!data) return;
          if (data.error) console.error("Branch error:", data.error);
          await fetchMessages();
          if (data.branchRoot) navigateToBranch(data.branchRoot.id);
        })
        .catch(console.error);
    },
  });

  const handleTreeNodeClick = useCallback(
    (messageId: string) => {
      // If clicking on a trunk node, go back to main view
      if (trunkIds.has(messageId)) {
        setActivePath([]);
      } else {
        navigateToBranch(messageId);
      }

      // Scroll to the message in the chat view after a short delay to allow re-render
      setTimeout(() => {
        const messageElement = document.getElementById(`message-${messageId}`);
        if (messageElement) {
          messageElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 100);
    },
    [navigateToBranch, trunkIds, setActivePath]
  );

  const handleDeleteBranch = useCallback(
    async (messageId: string) => {
      try {
        const res = await fetch(`/api/chat/${chatId}/branch/${messageId}`, {
          method: "DELETE",
        });

        if (!res.ok) {
          const error = await res.json();
          console.error("Failed to delete branch:", error);
          return;
        }

        // If we're viewing the branch that was deleted, go back to main
        if (activePath.includes(messageId)) {
          setActivePath([]);
        }

        // Refresh messages
        await fetchMessages();
      } catch (err) {
        console.error("Branch deletion failed:", err);
      }
    },
    [chatId, activePath, setActivePath, fetchMessages]
  );

  const isOnBranch = activePath.length > 0;

  return (
    <div className="flex h-full">
      <div className="flex flex-1 flex-col">
        {isOnBranch && (
          <div className="flex items-center gap-2 border-b border-border px-4 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setActivePath([])}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back to main
            </Button>
            <span className="text-xs text-muted-foreground">
              Viewing branch
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto" ref={scrollRef}>
          <div className="mx-auto max-w-3xl px-4">
            {displayMessages.length === 0 && !isLoading && (
              <div className="flex h-full items-center justify-center pt-20">
                <div className="text-center">
                  <h2 className="mb-2 text-2xl font-semibold">CuriosityLM</h2>
                  <p className="text-muted-foreground">
                    Start a conversation and explore topics with tree-based
                    branching.
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Select text and use Ctrl+1/2/3 to create branches
                  </p>
                </div>
              </div>
            )}

            {displayMessages.map((message, index) => {
              const isLast =
                index === displayMessages.length - 1 &&
                message.role === "assistant";
              return (
                <MessageBubble
                  key={message.id}
                  message={message}
                  isStreaming={isLast && isLoading}
                  streamingContent={
                    isLast && isLoading ? streamingContent : undefined
                  }
                  branches={getBranches(message.id)}
                  onBranchClick={navigateToBranch}
                  onTextSelect={handleTextSelect}
                />
              );
            })}

            {isLoading && displayMessages.length === 0 && (
              <div className="flex justify-start py-4">
                <div className="rounded-lg bg-muted px-4 py-3">
                  <span className="inline-block h-4 w-1 animate-pulse bg-foreground" />
                </div>
              </div>
            )}

            {displayMessages.length > 0 && (
              <ChatActions
                chatId={chatId}
                chatTitle={chatTitle}
                messages={displayMessages}
              />
            )}
          </div>
        </div>

        {error && (
          <div className="border-t border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {selectionState && (
          <TextSelectionToolbar
            position={selectionState.position}
            selectedText={selectionState.selectedText}
            messageId={selectionState.messageId}
            charStart={selectionState.charStart}
            charEnd={selectionState.charEnd}
            chatId={chatId}
            onBranch={handleBranch}
            onClose={() => setSelectionState(null)}
          />
        )}

        <MessageInput
          onSend={(content, image) => {
            const lastMessage = displayMessages[displayMessages.length - 1];
            sendMessage(content, lastMessage?.id || null, image);
          }}
          onStop={stopStreaming}
          isLoading={isLoading}
          supportsImages={modelSupportsImages(activeProvider, activeModel)}
        />
      </div>

      <TreePanel
        messages={messages}
        activeIds={activeIds}
        isOpen={showTree}
        onClose={() => setShowTree(false)}
        onNodeClick={handleTreeNodeClick}
        onDeleteBranch={handleDeleteBranch}
      />

      <MemoryPanel
        isOpen={showMemory}
        onClose={() => setShowMemory(false)}
      />
    </div>
  );
}
