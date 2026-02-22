"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useChat } from "@/hooks/useChat";
import { useOllama } from "@/hooks/useOllama";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { MessageBubble } from "./MessageBubble";
import { MessageInput } from "./MessageInput";
import { TextSelectionToolbar, loadShortcuts } from "./TextSelectionToolbar";
import { ChatActions } from "./ChatActions";
import { TypingBubbles } from "./TypingBubbles";
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
    return /gpt-5|gpt-4o|gpt-4-turbo|o1|o3|o4/i.test(model);
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
    failoverNotice,
    fetchMessages,
    sendMessage,
    streamBranch,
    stopStreaming,
    retryMessage,
    removeMessage,
    getPathMessages,
    navigateToBranch,
    setActivePath,
  } = useChat({ chatId });

  const ollama = useOllama();
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
  const [pendingEditContent, setPendingEditContent] = useState<string | null>(null);

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

  // Re-fetch chat title when auto-title is generated
  useEffect(() => {
    const handleTitleRefresh = () => {
      fetch(`/api/chat/${chatId}`)
        .then((r) => r.json())
        .then((data) => { if (data?.title) setChatTitle(data.title); })
        .catch(() => {});
    };
    window.addEventListener("refresh-sidebar", handleTitleRefresh);
    return () => window.removeEventListener("refresh-sidebar", handleTitleRefresh);
  }, [chatId]);

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

  // Include a synthetic streaming message in the tree so it updates in real-time
  const treeMessages = useMemo(() => {
    if (!streamingContent) return messages;
    const lastDisplayed = displayMessages[displayMessages.length - 1];
    if (!lastDisplayed) return messages;
    // Only add if there isn't already a real message being streamed
    if (messages.some((m) => m.id === "streaming")) return messages;
    const streamingMsg: Message = {
      id: "streaming",
      chatId,
      role: "assistant",
      content: streamingContent.slice(0, 80),
      parentId: lastDisplayed.id,
      isBranchRoot: false,
      branchPrompt: null,
      branchContext: null,
      branchSourceMessageId: null,
      branchCharStart: null,
      branchCharEnd: null,
      previewSummary: streamingContent.slice(0, 80),
      siblingIndex: 0,
      provider: null,
      model: null,
      createdAt: new Date().toISOString(),
    };
    return [...messages, streamingMsg];
  }, [messages, isLoading, streamingContent, displayMessages, chatId]);

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

  // Restore the browser selection after re-render so the highlight persists.
  // We walk the fresh DOM using charStart/charEnd offsets instead of restoring
  // a stale cloned Range (whose nodes may have been recreated by React).
  useLayoutEffect(() => {
    if (!selectionState) return;
    const container = document.getElementById(
      `message-content-${selectionState.messageId}`
    );
    if (!container) return;

    const { charStart, charEnd } = selectionState;
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    while (walker.nextNode()) {
      const node = walker.currentNode as Text;
      const len = node.length;
      if (!startNode && pos + len > charStart) {
        startNode = node;
        startOffset = charStart - pos;
      }
      if (pos + len >= charEnd) {
        endNode = node;
        endOffset = charEnd - pos;
        break;
      }
      pos += len;
    }

    if (startNode && endNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode, startOffset);
        range.setEnd(endNode, endOffset);
        const sel = window.getSelection();
        if (sel) {
          sel.removeAllRanges();
          sel.addRange(range);
        }
        // Update the ref so toolbar position stays correct
        selectionRangeRef.current = range;
      } catch {
        // Offsets may be out of bounds if content changed; ignore
      }
    }
  }, [selectionState]);

  // Clear selection state on mousedown so the previous highlight doesn't
  // interfere with a new selection the user is about to make.
  useEffect(() => {
    if (!selectionState) return;
    const handleMouseDown = (e: MouseEvent) => {
      // Don't clear if the click is inside the toolbar (it uses preventDefault)
      const toolbar = document.querySelector("[data-selection-toolbar]");
      if (toolbar && toolbar.contains(e.target as Node)) return;
      selectionRangeRef.current = null;
      setSelectionState(null);
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [selectionState]);

  const handleBranch = async (
    type: "learn_more" | "dont_understand" | "specifics" | "custom",
    customPrompt?: string
  ) => {
    if (!selectionState) return;

    setSelectionState(null);
    window.getSelection()?.removeAllRanges();

    const branchRootId = await streamBranch({
      chatId,
      sourceMessageId: selectionState.messageId,
      selectedText: selectionState.selectedText,
      charStart: selectionState.charStart,
      charEnd: selectionState.charEnd,
      branchType: type,
      customPrompt,
    });

    if (branchRootId) {
      const fresh = await fetchMessages();
      navigateToBranch(branchRootId, fresh);
    }
  };

  // Keyboard shortcuts for branching
  useKeyboardShortcuts({
    shortcuts,
    onBranch: (type, selectedText, messageId, charStart, charEnd, customPrompt) => {
      setSelectionState(null);
      streamBranch({
        chatId,
        sourceMessageId: messageId,
        selectedText,
        charStart,
        charEnd,
        branchType: type,
        customPrompt,
      }).then(async (branchRootId) => {
        if (branchRootId) {
          const fresh = await fetchMessages();
          navigateToBranch(branchRootId, fresh);
        }
      });
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

  // Detect if the last displayed message is a failed user message (no assistant child)
  const failedMessageId = useMemo(() => {
    if (isLoading || streamingContent) return null;
    const last = displayMessages[displayMessages.length - 1];
    if (!last || last.role !== "user") return null;
    // Check if there's any child message (assistant response)
    const hasChild = messages.some((m) => m.parentId === last.id);
    return hasChild ? null : last.id;
  }, [displayMessages, messages, isLoading, streamingContent]);

  const handleRetry = useCallback(
    (messageId: string) => {
      retryMessage(messageId);
    },
    [retryMessage]
  );

  const handleEditResend = useCallback(
    async (messageId: string) => {
      const content = await removeMessage(messageId);
      if (content) {
        setPendingEditContent(content);
      }
    },
    [removeMessage]
  );

  // Listen for provider switches from the TopBar
  useEffect(() => {
    const handler = (e: Event) => {
      const { provider, model } = (e as CustomEvent).detail;
      setActiveProvider(provider);
      setActiveModel(model);
    };
    window.addEventListener("provider-switched", handler);
    return () => window.removeEventListener("provider-switched", handler);
  }, []);

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
                  <h2 className="mb-2 text-2xl font-semibold">Curiosity</h2>
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

            {displayMessages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                branches={getBranches(message.id)}
                onBranchClick={navigateToBranch}
                onTextSelect={handleTextSelect}
                isFailed={message.id === failedMessageId}
                onRetry={handleRetry}
                onEditResend={handleEditResend}
              />
            ))}

            {/* Streaming assistant response — shown while generating or after interruption */}
            {streamingContent && (
              <MessageBubble
                key="streaming"
                message={{
                  id: "streaming",
                  chatId,
                  role: "assistant",
                  content: "",
                  parentId: displayMessages[displayMessages.length - 1]?.id ?? null,
                  isBranchRoot: false,
                  branchPrompt: null,
                  branchContext: null,
                  branchSourceMessageId: null,
                  branchCharStart: null,
                  branchCharEnd: null,
                  previewSummary: null,
                  siblingIndex: 0,
                  provider: null,
                  model: null,
                  createdAt: new Date().toISOString(),
                }}
                isStreaming={isLoading}
                streamingContent={streamingContent}
              />
            )}

            {isLoading && !streamingContent && (
              <div className="flex justify-start py-4">
                <div className="rounded-lg bg-muted px-4 py-3">
                  <TypingBubbles />
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

        {failoverNotice && (
          <div className="border-t border-amber-500/50 bg-amber-500/10 px-4 py-2 text-xs text-amber-700">
            Switched from {failoverNotice.fromProvider} to {failoverNotice.toProvider}: {failoverNotice.reason}
          </div>
        )}

        {error && (
          <div className="border-t border-destructive/50 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
            {(error.toLowerCase().includes("fetch failed") ||
              error.toLowerCase().includes("econnrefused") ||
              error.toLowerCase().includes("ollama")) && (
              <div className="mt-1 text-xs opacity-80">
                💡 If using Ollama locally, go to{" "}
                <a href="/settings" className="underline font-medium hover:opacity-100">
                  Settings
                </a>{" "}
                and click &quot;Detect Local Ollama&quot; to connect.
              </div>
            )}
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
            const ollamaOpts = activeProvider === "ollama" && ollama.permitted && ollama.isAvailable
              ? { baseUrl: ollama.baseUrl, model: activeModel }
              : undefined;
            sendMessage(content, lastMessage?.id || null, image, ollamaOpts);
          }}
          onStop={stopStreaming}
          isLoading={isLoading}
          supportsImages={modelSupportsImages(activeProvider, activeModel)}
          initialContent={pendingEditContent}
          onInitialContentConsumed={() => setPendingEditContent(null)}
        />
      </div>

      <TreePanel
        messages={treeMessages}
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
