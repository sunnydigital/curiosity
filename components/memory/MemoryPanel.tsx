"use client";

import { useState, useEffect } from "react";
import { Brain, Database, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MemoryItem {
  id: string;
  content: string;
  strength?: number;
  accessCount?: number;
  createdAt: string;
}

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  entryCount: number;
}

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MemoryPanel({ isOpen, onClose }: MemoryPanelProps) {
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeTab, setActiveTab] = useState<"memories" | "knowledge">("memories");
  const [newMemory, setNewMemory] = useState("");
  const [newKBName, setNewKBName] = useState("");
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [kbEntries, setKBEntries] = useState<any[]>([]);
  const [newEntry, setNewEntry] = useState("");

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
      fetchKnowledgeBases();
    }
  }, [isOpen]);

  const fetchMemories = async () => {
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      if (Array.isArray(data)) setMemories(data);
    } catch {}
  };

  const fetchKnowledgeBases = async () => {
    try {
      const res = await fetch("/api/memory/knowledge-bases");
      const data = await res.json();
      if (Array.isArray(data)) setKnowledgeBases(data);
    } catch {}
  };

  const addMemory = async () => {
    if (!newMemory.trim()) return;
    try {
      await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newMemory.trim() }),
      });
      setNewMemory("");
      fetchMemories();
    } catch {}
  };

  const createKB = async () => {
    if (!newKBName.trim()) return;
    try {
      await fetch("/api/memory/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKBName.trim() }),
      });
      setNewKBName("");
      fetchKnowledgeBases();
    } catch {}
  };

  const deleteKB = async (id: string) => {
    await fetch(`/api/memory/knowledge-bases/${id}`, { method: "DELETE" });
    if (selectedKB === id) setSelectedKB(null);
    fetchKnowledgeBases();
  };

  const fetchEntries = async (kbId: string) => {
    const res = await fetch(`/api/memory/knowledge-bases/${kbId}/entries`);
    const data = await res.json();
    if (Array.isArray(data)) setKBEntries(data);
  };

  const addEntry = async () => {
    if (!selectedKB || !newEntry.trim()) return;
    try {
      await fetch(`/api/memory/knowledge-bases/${selectedKB}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newEntry.trim() }),
      });
      setNewEntry("");
      fetchEntries(selectedKB);
    } catch {}
  };

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4" />
          <span className="text-sm font-medium">Memory</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex border-b border-border">
        <button
          className={`flex-1 px-3 py-2 text-xs ${
            activeTab === "memories"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("memories")}
        >
          Memories
        </button>
        <button
          className={`flex-1 px-3 py-2 text-xs ${
            activeTab === "knowledge"
              ? "border-b-2 border-primary text-foreground"
              : "text-muted-foreground"
          }`}
          onClick={() => setActiveTab("knowledge")}
        >
          Knowledge Bases
        </button>
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "memories" && (
          <div className="p-3 space-y-2">
            <div className="flex gap-1">
              <Input
                value={newMemory}
                onChange={(e) => setNewMemory(e.target.value)}
                placeholder="Add a memory..."
                className="h-8 text-xs"
                onKeyDown={(e) => e.key === "Enter" && addMemory()}
              />
              <Button size="sm" className="h-8" onClick={addMemory}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
            <Separator />
            {memories.map((m) => (
              <div
                key={m.id}
                className="rounded-md border border-border p-2 text-xs"
              >
                <div>{m.content}</div>
                {m.strength !== undefined && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Strength: {m.strength.toFixed(2)} | Accessed:{" "}
                    {m.accessCount}x
                  </div>
                )}
              </div>
            ))}
            {memories.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No memories yet. Chat to build up context.
              </div>
            )}
          </div>
        )}

        {activeTab === "knowledge" && (
          <div className="p-3 space-y-2">
            {!selectedKB ? (
              <>
                <div className="flex gap-1">
                  <Input
                    value={newKBName}
                    onChange={(e) => setNewKBName(e.target.value)}
                    placeholder="New knowledge base..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && createKB()}
                  />
                  <Button size="sm" className="h-8" onClick={createKB}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Separator />
                {knowledgeBases.map((kb) => (
                  <div
                    key={kb.id}
                    className="group flex items-center justify-between rounded-md border border-border p-2 text-xs cursor-pointer hover:bg-accent"
                    onClick={() => {
                      setSelectedKB(kb.id);
                      fetchEntries(kb.id);
                    }}
                  >
                    <div>
                      <div className="flex items-center gap-1">
                        <Database className="h-3 w-3" />
                        {kb.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        {kb.entryCount} entries
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteKB(kb.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                {knowledgeBases.length === 0 && (
                  <div className="py-4 text-center text-xs text-muted-foreground">
                    Create a knowledge base to store information.
                  </div>
                )}
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSelectedKB(null)}
                >
                  Back to list
                </Button>
                <div className="flex gap-1">
                  <Input
                    value={newEntry}
                    onChange={(e) => setNewEntry(e.target.value)}
                    placeholder="Add entry..."
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && addEntry()}
                  />
                  <Button size="sm" className="h-8" onClick={addEntry}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Separator />
                {kbEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-md border border-border p-2 text-xs"
                  >
                    {entry.content}
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
