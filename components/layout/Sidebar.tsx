"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import { Plus, Search, MessageSquare, Star, Pencil, Trash2, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { Chat } from "@/types";

export function Sidebar() {
  const router = useRouter();
  const params = useParams();
  const currentChatId = params?.chatId as string | undefined;

  const [chats, setChats] = useState<Chat[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const fetchChats = useCallback(async () => {
    try {
      const url = searchQuery
        ? `/api/chats?q=${encodeURIComponent(searchQuery)}`
        : "/api/chats";
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      setChats(data);
    } catch (error) {
      console.error("Failed to fetch chats:", error);
    }
  }, [searchQuery]);

  useEffect(() => {
    fetchChats();
  }, [fetchChats]);

  // Refresh chats when navigating
  useEffect(() => {
    fetchChats();
  }, [currentChatId, fetchChats]);

  // Refresh sidebar periodically to catch title updates and listen for custom events
  useEffect(() => {
    const interval = setInterval(fetchChats, 3000);

    const handleRefresh = () => fetchChats();
    window.addEventListener("refresh-sidebar", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refresh-sidebar", handleRefresh);
    };
  }, [fetchChats]);

  const handleNewChat = async () => {
    try {
      const res = await fetch("/api/chat", { method: "POST" });
      if (!res.ok) return;
      const chat = await res.json();
      router.push(`/chat/${chat.id}`);
      fetchChats();
    } catch (error) {
      console.error("Failed to create chat:", error);
    }
  };

  const handleDeleteChat = (chatId: string, title: string) => {
    setDeleteTarget({ id: chatId, title });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await fetch(`/api/chat/${deleteTarget.id}`, { method: "DELETE" });
      if (currentChatId === deleteTarget.id) {
        router.push("/");
      }
      fetchChats();
    } catch (error) {
      console.error("Failed to delete chat:", error);
    }
    setDeleteTarget(null);
  };

  const handleStarChat = async (chatId: string, starred: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/chat/${chatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ starred: !starred }),
      });
      fetchChats();
    } catch (error) {
      console.error("Failed to star chat:", error);
    }
  };

  const handleRenameChat = (chatId: string, currentTitle: string) => {
    setRenameTarget({ id: chatId, title: currentTitle });
    setRenameValue(currentTitle);
  };

  const confirmRename = async () => {
    if (!renameTarget || !renameValue.trim() || renameValue.trim() === renameTarget.title) {
      setRenameTarget(null);
      return;
    }
    try {
      await fetch(`/api/chat/${renameTarget.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: renameValue.trim() }),
      });
      fetchChats();
    } catch (error) {
      console.error("Failed to rename chat:", error);
    }
    setRenameTarget(null);
  };

  if (collapsed) {
    return (
      <div className="flex w-12 flex-col items-center border-r border-border bg-background py-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(false)}
          className="mb-4"
        >
          <MessageSquare className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleNewChat}>
          <Plus className="h-5 w-5" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex flex-col border-r border-border bg-background transition-[width] duration-200",
        expanded ? "w-96" : "w-64"
      )}
    >
      <div className="flex items-center justify-between p-4">
        <h2
          className="cursor-pointer text-lg font-semibold"
          onClick={() => setCollapsed(true)}
        >
          CuriosityLM
        </h2>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "Narrow sidebar" : "Expand sidebar"}
          >
            {expanded ? (
              <ChevronsLeft className="h-4 w-4" />
            ) : (
              <ChevronsRight className="h-4 w-4" />
            )}
          </Button>
          <Button variant="ghost" size="icon" onClick={handleNewChat}>
            <Plus className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search chats..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className={cn(
                "group flex cursor-pointer rounded-md px-2 py-2 text-sm hover:bg-accent",
                expanded ? "items-start" : "items-center",
                currentChatId === chat.id && "bg-accent"
              )}
              onClick={() => router.push(`/chat/${chat.id}`)}
            >
              {/* Star button on left */}
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-6 w-6 shrink-0",
                  chat.starred ? "text-yellow-500" : "opacity-0 group-hover:opacity-100"
                )}
                onClick={(e) => handleStarChat(chat.id, chat.starred, e)}
              >
                <Star className={cn("h-3 w-3", chat.starred && "fill-current")} />
              </Button>

              {/* Chat title - single line when narrow, up to 3 lines when expanded */}
              <div className="min-w-0 flex-1">
                {expanded ? (
                  <span
                    className="block overflow-hidden text-ellipsis"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 3,
                      WebkitBoxOrient: "vertical",
                    }}
                    title={chat.title}
                  >
                    {chat.title}
                  </span>
                ) : (
                  <span className="block truncate" title={chat.title}>
                    {chat.title.length > 18
                      ? chat.title.slice(0, 18) + "..."
                      : chat.title}
                  </span>
                )}
              </div>

              {/* Action buttons - fixed to the right */}
              <div className="ml-1 flex shrink-0 items-center gap-0.5">
                <button
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRenameChat(chat.id, chat.title);
                  }}
                >
                  <Pencil className="h-3 w-3" />
                </button>
                <button
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-destructive hover:bg-destructive/10"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteChat(chat.id, chat.title);
                  }}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
          {chats.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No chats yet
            </div>
          )}
        </div>
      </ScrollArea>

      {deleteTarget && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setDeleteTarget(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Delete chat</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Are you sure you want to delete{" "}
              <span className="font-medium text-foreground">
                {deleteTarget.title.length > 30
                  ? deleteTarget.title.slice(0, 30) + "..."
                  : deleteTarget.title}
              </span>
              ? This action cannot be undone.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={confirmDelete}
              >
                Delete
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {renameTarget && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setRenameTarget(null)}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Rename chat</h3>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                confirmRename();
              }}
            >
              <Input
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Chat name..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setRenameTarget(null);
                  }
                }}
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRenameTarget(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                >
                  Rename
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
