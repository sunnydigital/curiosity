"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import type { Message, FailoverEvent, LLMProviderName } from "@/types";
import { streamOllamaChat } from "@/lib/llm/ollama-client";

interface UseChatOptions {
  chatId: string;
}

// Helper function to handle failback model changes
async function handleFailbackModelChange(actualProvider: LLMProviderName, actualModel: string) {
  try {
    const response = await fetch("/api/settings");
    const currentSettings = await response.json();

    const hasChanged =
      currentSettings.activeProvider !== actualProvider ||
      currentSettings.activeModel !== actualModel;

    if (hasChanged) {
      // Persist the failback model to settings
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          activeProvider: actualProvider,
          activeModel: actualModel
        }),
      });

      // Notify TopBar and ChatView to update their UI
      window.dispatchEvent(
        new CustomEvent("provider-switched", {
          detail: {
            provider: actualProvider,
            model: actualModel
          }
        })
      );
    }
  } catch {
    // Best effort - ignore errors
  }
}

export function useChat({ chatId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[]>([]);
  const [failoverNotice, setFailoverNotice] = useState<FailoverEvent | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Refs to avoid stale closures in sendMessage
  const messagesRef = useRef<Message[]>(messages);
  messagesRef.current = messages;
  const activePathRef = useRef<string[]>(activePath);
  activePathRef.current = activePath;
  const streamingContentRef = useRef<string>("");
  const lastUserMessageIdRef = useRef<string | null>(null);
  const pendingBranchNavRef = useRef<string | null>(null);

  // Navigate to a branch root once it appears in messages state.
  // This ensures activePath is only set AFTER messages contains the branch root,
  // avoiding a render where activePath references an ID not yet in messages.
  useEffect(() => {
    const branchRootId = pendingBranchNavRef.current;
    if (!branchRootId) return;
    if (!messages.some((m) => m.id === branchRootId)) return;

    pendingBranchNavRef.current = null;
    // Build path from root to branch root
    const pathToRoot: string[] = [];
    let cur = messages.find((m) => m.id === branchRootId);
    while (cur) {
      pathToRoot.unshift(cur.id);
      if (!cur.parentId) break;
      cur = messages.find((m) => m.id === cur!.parentId);
    }
    setActivePath(pathToRoot);
  }, [messages]);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/${chatId}/messages`);
      const data = await res.json();
      setMessages(data);
      return data as Message[];
    } catch (err: any) {
      setError(err.message);
      return [];
    }
  }, [chatId]);

  const computeMainPath = useCallback(
    (msgs: Message[]): string[] => {
      if (msgs.length === 0) return [];
      const root = msgs.find((m) => !m.parentId);
      if (!root) return [];
      const path: string[] = [root.id];
      let current = root;
      while (true) {
        // Find the first child that is NOT a branch root (trunk continuation)
        const children = msgs.filter((m) => m.parentId === current.id);
        const trunkChild = children.find((c) => !c.isBranchRoot);
        if (!trunkChild) break;
        path.push(trunkChild.id);
        current = trunkChild;
      }
      return path;
    },
    []
  );

  const sendMessage = useCallback(
    async (content: string, parentId?: string | null, image?: File, ollamaOptions?: { baseUrl: string; model: string }) => {
      setIsLoading(true);
      setStreamingContent("");
      streamingContentRef.current = "";
      lastUserMessageIdRef.current = null;
      setError(null);

      abortRef.current = new AbortController();

      try {
        // Convert image file to base64 if provided
        let imageData: { base64: string; mimeType: string } | undefined;
        if (image) {
          const buffer = await image.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), "")
          );
          imageData = { base64, mimeType: image.type };
        }

        if (ollamaOptions) {
          // Client-side Ollama streaming: save user message via API, stream from localhost, save assistant message via API
          const resolvedParentId = parentId || getLastMessageId();

          // Save user message to DB
          const userMsgRes = await fetch(`/api/chat/${chatId}/messages`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, parentId: resolvedParentId, saveOnly: true }),
          });
          const userMessage = await userMsgRes.json();
          setMessages((prev) => [...prev, userMessage]);
          lastUserMessageIdRef.current = userMessage.id;

          // Build context: fetch path to root for this user message
          const contextRes = await fetch(`/api/chat/${chatId}/messages`);
          const allMessages = await contextRes.json();
          // Build path from root to user message
          const pathMessages: { role: string; content: string }[] = [];
          let cur = allMessages.find((m: any) => m.id === userMessage.id);
          const chain: any[] = [];
          while (cur) {
            chain.unshift(cur);
            cur = cur.parentId ? allMessages.find((m: any) => m.id === cur.parentId) : null;
          }
          for (const m of chain) {
            pathMessages.push({ role: m.role, content: m.content });
          }

          // Stream from local Ollama
          let fullContent = "";
          for await (const chunk of streamOllamaChat({
            baseUrl: ollamaOptions.baseUrl,
            model: ollamaOptions.model,
            messages: pathMessages,
          })) {
            if (abortRef.current?.signal.aborted) break;
            fullContent += chunk;
            streamingContentRef.current += chunk;
            setStreamingContent((prev) => prev + chunk);
          }

          // Save assistant message to DB
          const assistantRes = await fetch(`/api/chat/${chatId}/messages/partial`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: fullContent,
              parentId: userMessage.id,
              provider: "ollama",
              model: ollamaOptions.model,
            }),
          });
          const assistantMessage = await assistantRes.json();
          setMessages((prev) => [...prev, assistantMessage]);
          setStreamingContent("");
          streamingContentRef.current = "";

          // Auto-generate title for new chats via server (uses cloud provider fallback)
          try {
            const titleRes = await fetch(`/api/chat/${chatId}/generate-title`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                userContent: content,
                assistantContent: fullContent.slice(0, 500),
              }),
            });
            if (titleRes.ok) {
              const titleData = await titleRes.json();
              if (titleData.titleUpdated) {
                window.dispatchEvent(new CustomEvent("refresh-sidebar"));
              }
            }
          } catch {}

          // Client-side memory creation for Ollama (server can't reach localhost)
          try {
            const { createMemoriesClientSide } = await import("@/lib/memory/client-memory");
            const embeddingModel = "nomic-embed-text";
            await createMemoriesClientSide({
              baseUrl: ollamaOptions.baseUrl,
              chatModel: ollamaOptions.model,
              embeddingModel,
              chatId,
              messageId: userMessage.id,
              userContent: content,
              assistantContent: fullContent,
            });
          } catch (err) {
            console.warn("[useChat] Client-side memory creation failed:", err);
          }

          return;
        }

        const response = await fetch("/api/llm/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            content,
            parentId: parentId || getLastMessageId(),
            image: imageData,
          }),
          signal: abortRef.current.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            try {
              const event = JSON.parse(json);
              if (event.type === "user_message") {
                setMessages((prev) => [...prev, event.message]);
                lastUserMessageIdRef.current = event.message.id;
              } else if (event.type === "chunk") {
                streamingContentRef.current += event.content;
                setStreamingContent((prev) => prev + event.content);
              } else if (event.type === "done") {
                setMessages((prev) => [...prev, event.message]);
                setStreamingContent("");
                streamingContentRef.current = "";
                // Handle failback model changes
                if (event.actualProvider && event.actualModel) {
                  handleFailbackModelChange(event.actualProvider, event.actualModel);
                }
              } else if (event.type === "title_updated") {
                window.dispatchEvent(new CustomEvent("refresh-sidebar"));
              } else if (event.type === "failover") {
                setFailoverNotice(event as FailoverEvent);
                setTimeout(() => setFailoverNotice(null), 8000);
              } else if (event.type === "error") {
                setError(event.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    [chatId]
  );

  // Uses refs to always read current state, even inside stale closures (e.g. sendMessage)
  const getLastMessageId = useCallback((): string | null => {
    const currentPath = activePathRef.current;
    const currentMessages = messagesRef.current;
    if (currentPath.length > 0) return currentPath[currentPath.length - 1];
    if (currentMessages.length === 0) return null;
    // Find the leaf of the main trunk path (follow non-branch-root children)
    const root = currentMessages.find((m) => !m.parentId);
    if (!root) return null;
    let current = root;
    while (true) {
      const children = currentMessages.filter((m) => m.parentId === current.id);
      const trunkChild = children.find((c) => !c.isBranchRoot);
      if (!trunkChild) return current.id;
      current = trunkChild;
    }
  }, []);

  const retryMessage = useCallback(
    async (userMessageId: string) => {
      setIsLoading(true);
      setStreamingContent("");
      streamingContentRef.current = "";
      lastUserMessageIdRef.current = userMessageId;
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/llm/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userMessageId }),
          signal: abortRef.current.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            try {
              const event = JSON.parse(json);
              if (event.type === "chunk") {
                streamingContentRef.current += event.content;
                setStreamingContent((prev) => prev + event.content);
              } else if (event.type === "done") {
                setMessages((prev) => [...prev, event.message]);
                setStreamingContent("");
                streamingContentRef.current = "";
              } else if (event.type === "title_updated") {
                window.dispatchEvent(new CustomEvent("refresh-sidebar"));
              } else if (event.type === "failover") {
                setFailoverNotice(event as FailoverEvent);
                setTimeout(() => setFailoverNotice(null), 8000);
              } else if (event.type === "error") {
                setError(event.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }
    },
    []
  );

  const streamBranch = useCallback(
    async (branchRequest: {
      chatId: string;
      sourceMessageId: string;
      selectedText: string;
      charStart: number;
      charEnd: number;
      branchType: string;
      customPrompt?: string;
    }): Promise<string | null> => {
      setIsLoading(true);
      setStreamingContent("");
      streamingContentRef.current = "";
      lastUserMessageIdRef.current = null;
      setError(null);

      abortRef.current = new AbortController();
      let branchRootId: string | null = null;

      try {
        const response = await fetch(`/api/chat/${branchRequest.chatId}/branch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(branchRequest),
          signal: abortRef.current.signal,
        });

        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const json = line.slice(6);
            try {
              const event = JSON.parse(json);
              if (event.type === "branch_root") {
                // Add branch root to messages; navigation happens in the
                // pendingBranchNav effect once messages state updates
                const branchRoot = event.message as Message;
                branchRootId = branchRoot.id;
                lastUserMessageIdRef.current = branchRoot.id;
                pendingBranchNavRef.current = branchRoot.id;
                setMessages((prev) => [...prev, branchRoot]);
              } else if (event.type === "chunk") {
                streamingContentRef.current += event.content;
                setStreamingContent((prev) => prev + event.content);
              } else if (event.type === "done") {
                setMessages((prev) => [...prev, event.message]);
                setStreamingContent("");
                streamingContentRef.current = "";
                // Handle failback model changes
                if (event.actualProvider && event.actualModel) {
                  handleFailbackModelChange(event.actualProvider, event.actualModel);
                }
              } else if (event.type === "failover") {
                setFailoverNotice(event as FailoverEvent);
                setTimeout(() => setFailoverNotice(null), 8000);
              } else if (event.type === "error") {
                setError(event.error);
              }
            } catch {
              // ignore parse errors
            }
          }
        }
      } catch (err: any) {
        if (err.name !== "AbortError") {
          setError(err.message);
        }
      } finally {
        setIsLoading(false);
        abortRef.current = null;
      }

      return branchRootId;
    },
    [chatId]
  );

  const removeMessage = useCallback(
    async (messageId: string): Promise<string | null> => {
      const message = messages.find((m) => m.id === messageId);
      if (!message) return null;

      const chatId = message.chatId;
      try {
        const res = await fetch(`/api/chat/${chatId}/messages/${messageId}`, {
          method: "DELETE",
        });
        if (!res.ok) return null;

        setMessages((prev) => prev.filter((m) => m.id !== messageId));
        return message.content;
      } catch {
        return null;
      }
    },
    [messages]
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();

    const partialContent = streamingContentRef.current;
    const parentId = lastUserMessageIdRef.current;

    if (partialContent && parentId) {
      // Save partial content to DB so it persists across navigation
      fetch(`/api/chat/${chatId}/messages/partial`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: partialContent, parentId }),
      })
        .then((r) => r.json())
        .then((savedMessage) => {
          if (savedMessage?.id) {
            setMessages((prev) => [...prev, savedMessage]);
            setStreamingContent("");
            streamingContentRef.current = "";
          }
        })
        .catch(() => {
          // Best-effort; partial content remains visible via streamingContent
        });
    }
  }, [chatId]);

  const getPathMessages = useCallback(
    (path?: string[]): Message[] => {
      const ids = path || activePath;
      if (ids.length === 0) {
        // Default: return main trunk path (non-branch-root children)
        const root = messages.find((m) => !m.parentId);
        if (!root) return [];
        const result: Message[] = [root];
        let current = root;
        while (true) {
          const children = messages.filter((m) => m.parentId === current.id);
          const trunkChild = children.find((c) => !c.isBranchRoot);
          if (!trunkChild) break;
          result.push(trunkChild);
          current = trunkChild;
        }
        return result;
      }
      const result = ids
        .map((id) => messages.find((m) => m.id === id))
        .filter(Boolean) as Message[];

      // Continue past the last ID in the path to pick up any new messages
      // (e.g. messages sent while viewing a branch)
      if (result.length > 0) {
        let current = result[result.length - 1];
        while (true) {
          const children = messages.filter((m) => m.parentId === current.id);
          const nextChild = children.find((c) => !c.isBranchRoot);
          if (!nextChild) break;
          result.push(nextChild);
          current = nextChild;
        }
      }

      return result;
    },
    [messages, activePath]
  );

  const navigateToBranch = useCallback(
    (branchRootId: string, freshMessages?: Message[]) => {
      // Accept an optional fresh messages array to avoid stale-closure issues
      // (e.g. right after fetchMessages updates state but before re-render)
      const msgs = freshMessages ?? messages;

      // Build path from root to branch root, then follow its main path
      const pathToRoot: string[] = [];
      let current = msgs.find((m) => m.id === branchRootId);
      while (current) {
        pathToRoot.unshift(current.id);
        if (!current.parentId) break;
        current = msgs.find((m) => m.id === current!.parentId);
      }
      // Continue from branch root following non-branch-root children
      let last = msgs.find((m) => m.id === branchRootId);
      if (last) {
        const children = msgs.filter((m) => m.parentId === last!.id);
        let child = children.find((c) => !c.isBranchRoot);
        while (child) {
          pathToRoot.push(child.id);
          last = child;
          const nextChildren = msgs.filter((m) => m.parentId === last!.id);
          child = nextChildren.find((c) => !c.isBranchRoot);
        }
      }
      setActivePath(pathToRoot);
    },
    [messages]
  );

  return {
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
    computeMainPath,
  };
}
