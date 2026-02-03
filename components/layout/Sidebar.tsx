"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useParams } from "next/navigation";
import {
  Plus,
  Search,
  Star,
  Pencil,
  Trash2,
  PanelLeftClose,
  FolderKanban,
  ChevronDown,
  ChevronRight,
  TrendingUp,
  BookOpen,
  PenTool,
  Plane,
  FlaskConical,
  GripVertical,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { LightbulbIcon } from "@/components/layout/LightbulbIcon";
import type { Chat, Project } from "@/types";

const DEFAULT_PROJECT_PRESETS = [
  { title: "Investing", icon: "TrendingUp" },
  { title: "Homework", icon: "BookOpen" },
  { title: "Writing", icon: "PenTool" },
  { title: "Travel", icon: "Plane" },
  { title: "Research", icon: "FlaskConical" },
] as const;

function ProjectIcon({ icon, className }: { icon: string | null; className?: string }) {
  const cls = className || "h-4 w-4";
  switch (icon) {
    case "TrendingUp":
      return <TrendingUp className={cls} />;
    case "BookOpen":
      return <BookOpen className={cls} />;
    case "PenTool":
      return <PenTool className={cls} />;
    case "Plane":
      return <Plane className={cls} />;
    case "FlaskConical":
      return <FlaskConical className={cls} />;
    default:
      return <FolderKanban className={cls} />;
  }
}

export function Sidebar() {
  const router = useRouter();
  const params = useParams();
  const currentChatId = params?.chatId as string | undefined;

  const [chats, setChats] = useState<Chat[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [bulbHovered, setBulbHovered] = useState(false);

  // Delete / Rename modals
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameTarget, setRenameTarget] = useState<{ id: string; title: string } | null>(null);
  const [renameValue, setRenameValue] = useState("");

  // Projects
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [newProjectTitle, setNewProjectTitle] = useState("");
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set());

  // Drag-and-drop
  const [dragChatId, setDragChatId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);

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

  const fetchProjects = useCallback(async () => {
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = await res.json();
      setProjects(data);
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  }, []);

  useEffect(() => {
    fetchChats();
    fetchProjects();
  }, [fetchChats, fetchProjects]);

  useEffect(() => {
    fetchChats();
  }, [currentChatId, fetchChats]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchChats();
      fetchProjects();
    }, 3000);

    const handleRefresh = () => {
      fetchChats();
      fetchProjects();
    };
    window.addEventListener("refresh-sidebar", handleRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refresh-sidebar", handleRefresh);
    };
  }, [fetchChats, fetchProjects]);

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

  // Project CRUD
  const handleCreateProject = async () => {
    if (!newProjectTitle.trim()) return;
    const preset = DEFAULT_PROJECT_PRESETS.find((p) => p.title === newProjectTitle.trim());
    try {
      await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newProjectTitle.trim(),
          icon: preset?.icon || null,
        }),
      });
      fetchProjects();
      setNewProjectTitle("");
      setShowProjectDialog(false);
    } catch (error) {
      console.error("Failed to create project:", error);
    }
  };

  const handleDeleteProject = async (projectId: string) => {
    try {
      await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      fetchProjects();
      fetchChats();
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  };

  const toggleProjectCollapsed = (projectId: string) => {
    setCollapsedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  // Drag-and-drop handlers
  const handleDragStart = (chatId: string) => {
    setDragChatId(chatId);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    setDragOverTarget(targetId);
  };

  const handleDragLeave = () => {
    setDragOverTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, projectId: string | null) => {
    e.preventDefault();
    setDragOverTarget(null);
    if (!dragChatId) return;
    try {
      await fetch(`/api/chat/${dragChatId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId }),
      });
      fetchChats();
    } catch (error) {
      console.error("Failed to move chat:", error);
    }
    setDragChatId(null);
  };

  const handleDragEnd = () => {
    setDragChatId(null);
    setDragOverTarget(null);
  };

  // Group chats by project
  const chatsByProject = new Map<string | null, Chat[]>();
  for (const chat of chats) {
    const key = chat.projectId;
    if (!chatsByProject.has(key)) {
      chatsByProject.set(key, []);
    }
    chatsByProject.get(key)!.push(chat);
  }

  // Render a single chat item
  const renderChatItem = (chat: Chat) => (
    <div
      key={chat.id}
      draggable
      onDragStart={() => handleDragStart(chat.id)}
      onDragEnd={handleDragEnd}
      className={cn(
        "group flex cursor-pointer items-start rounded-md px-2 py-2 text-sm hover:bg-accent",
        currentChatId === chat.id && "bg-accent",
        dragChatId === chat.id && "opacity-50"
      )}
      onClick={() => router.push(`/chat/${chat.id}`)}
    >
      <GripVertical className="mr-1 mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground opacity-0 group-hover:opacity-60" />

      {/* Star button */}
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

      {/* Chat title */}
      <div className="min-w-0 flex-1">
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
      </div>

      {/* Action buttons */}
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
  );

  // Shared project modal (rendered via portal so it works in both states)
  const projectModal = showProjectDialog
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setShowProjectDialog(false)}
        >
          <div
            className="mx-4 w-full max-w-xl rounded-lg border border-border bg-background p-6 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-foreground">Create Project</h3>
            <form
              className="mt-3"
              onSubmit={(e) => {
                e.preventDefault();
                handleCreateProject();
              }}
            >
              <Input
                value={newProjectTitle}
                onChange={(e) => setNewProjectTitle(e.target.value)}
                placeholder="Project name..."
                autoFocus
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {DEFAULT_PROJECT_PRESETS.map((preset) => (
                  <button
                    key={preset.title}
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent",
                      newProjectTitle === preset.title &&
                        "border-primary bg-primary/10 text-primary"
                    )}
                    onClick={() => setNewProjectTitle(preset.title)}
                  >
                    <ProjectIcon icon={preset.icon} className="h-3.5 w-3.5" />
                    {preset.title}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowProjectDialog(false);
                    setNewProjectTitle("");
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={!newProjectTitle.trim()}>
                  Create
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )
    : null;

  // ─── Collapsed state ───
  if (collapsed) {
    return (
      <>
        <div className="flex w-12 flex-col items-center border-r border-border bg-background py-4">
          <button
            className="mb-4 flex items-center justify-center"
            onClick={() => setCollapsed(false)}
            onMouseEnter={() => setBulbHovered(true)}
            onMouseLeave={() => setBulbHovered(false)}
          >
            <LightbulbIcon hovered={bulbHovered} className="h-8 w-8" />
          </button>
          <Button variant="ghost" size="icon" onClick={handleNewChat}>
            <Plus className="h-5 w-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowProjectDialog(true)}
            title="Projects"
            className="mt-1"
          >
            <FolderKanban className="h-5 w-5" />
          </Button>
        </div>
        {projectModal}
      </>
    );
  }

  // ─── Expanded state ───
  return (
    <div className="relative flex w-96 flex-col border-r border-border bg-background transition-[width] duration-200">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <h2
          className="cursor-pointer text-lg font-semibold hover:text-primary"
          onClick={handleNewChat}
          title="New chat"
        >
          Curiosity
        </h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(true)}
          title="Collapse sidebar"
        >
          <PanelLeftClose className="h-4 w-4" />
        </Button>
      </div>

      {/* Search */}
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

      {/* New Chat button */}
      <div className="px-4 pb-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
          onClick={handleNewChat}
        >
          <Plus className="h-4 w-4" />
          New Chat
        </Button>
      </div>

      {/* Projects button */}
      <div className="px-4 pb-2">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => setShowProjectDialog(true)}
        >
          <FolderKanban className="h-4 w-4" />
          Projects
          <Plus className="ml-auto h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Chat list */}
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {/* Project groups */}
          {projects.map((project) => {
            const projectChats = chatsByProject.get(project.id) || [];
            const isCollapsed = collapsedProjects.has(project.id);
            const isDragOver = dragOverTarget === project.id;

            return (
              <div
                key={project.id}
                onDragOver={(e) => handleDragOver(e, project.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, project.id)}
              >
                <div
                  className={cn(
                    "group/project flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:bg-accent",
                    isDragOver && "bg-primary/10 ring-1 ring-primary"
                  )}
                  onClick={() => toggleProjectCollapsed(project.id)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  )}
                  <ProjectIcon icon={project.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span className="flex-1 truncate">{project.title}</span>
                  <button
                    className="inline-flex h-5 w-5 items-center justify-center rounded text-destructive opacity-0 hover:bg-destructive/10 group-hover/project:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteProject(project.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
                {!isCollapsed && (
                  <div className="ml-3 space-y-0.5">
                    {projectChats.map(renderChatItem)}
                    {projectChats.length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground/60">
                        Drag chats here
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Ungrouped chats */}
          <div
            onDragOver={(e) => handleDragOver(e, "ungrouped")}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, null)}
          >
            {projects.length > 0 && (chatsByProject.get(null)?.length ?? 0) > 0 && (
              <div
                className={cn(
                  "mt-2 px-2 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground",
                  dragOverTarget === "ungrouped" && "rounded-md bg-primary/10 ring-1 ring-primary"
                )}
              >
                Ungrouped
              </div>
            )}
            {(chatsByProject.get(null) || []).map(renderChatItem)}
          </div>

          {chats.length === 0 && (
            <div className="px-3 py-8 text-center text-sm text-muted-foreground">
              No chats yet
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Delete modal */}
      {deleteTarget &&
        createPortal(
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
                <Button variant="ghost" size="sm" onClick={() => setDeleteTarget(null)}>
                  Cancel
                </Button>
                <Button variant="destructive" size="sm" onClick={confirmDelete}>
                  Delete
                </Button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* Rename modal */}
      {renameTarget &&
        createPortal(
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
                  <Button type="submit" size="sm">
                    Rename
                  </Button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {projectModal}
    </div>
  );
}
