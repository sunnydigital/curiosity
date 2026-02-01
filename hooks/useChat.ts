"use client";

import { useState, useCallback, useRef } from "react";
import type { Message } from "@/types";

interface UseChatOptions {
  chatId: string;
}

export function useChat({ chatId }: UseChatOptions) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string[]>([]);
  const abortRef = useRef<AbortController | null>(null);

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
    async (content: string, parentId?: string | null) => {
      setIsLoading(true);
      setStreamingContent("");
      setError(null);

      abortRef.current = new AbortController();

      try {
        const response = await fetch("/api/llm/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId,
            content,
            parentId: parentId || getLastMessageId(),
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
              } else if (event.type === "chunk") {
                setStreamingContent((prev) => prev + event.content);
              } else if (event.type === "done") {
                setMessages((prev) => [...prev, event.message]);
                setStreamingContent("");
              } else if (event.type === "title_updated") {
                window.dispatchEvent(new CustomEvent("refresh-sidebar"));
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

  const getLastMessageId = useCallback((): string | null => {
    if (activePath.length > 0) return activePath[activePath.length - 1];
    if (messages.length === 0) return null;
    // Find the leaf of the main trunk path (follow non-branch-root children)
    const root = messages.find((m) => !m.parentId);
    if (!root) return null;
    let current = root;
    while (true) {
      // Find the first child that is NOT a branch root (continuation of trunk)
      const children = messages.filter((m) => m.parentId === current.id);
      const trunkChild = children.find((c) => !c.isBranchRoot);
      if (!trunkChild) return current.id;
      current = trunkChild;
    }
  }, [messages, activePath]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

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
      return ids
        .map((id) => messages.find((m) => m.id === id))
        .filter(Boolean) as Message[];
    },
    [messages, activePath]
  );

  const navigateToBranch = useCallback(
    (branchRootId: string) => {
      // Build path from root to branch root, then follow its main path
      const pathToRoot: string[] = [];
      let current = messages.find((m) => m.id === branchRootId);
      while (current) {
        pathToRoot.unshift(current.id);
        if (!current.parentId) break;
        current = messages.find((m) => m.id === current!.parentId);
      }
      // Continue from branch root following non-branch-root children
      let last = messages.find((m) => m.id === branchRootId);
      if (last) {
        const children = messages.filter((m) => m.parentId === last!.id);
        let child = children.find((c) => !c.isBranchRoot);
        while (child) {
          pathToRoot.push(child.id);
          last = child;
          const nextChildren = messages.filter((m) => m.parentId === last!.id);
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
    fetchMessages,
    sendMessage,
    stopStreaming,
    getPathMessages,
    navigateToBranch,
    setActivePath,
    computeMainPath,
  };
}
