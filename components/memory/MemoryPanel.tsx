"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Brain, Database, Plus, Trash2, X, AlertTriangle, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface MemoryItem {
  id: string;
  content: string;
  embeddingModel: string | null;
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
  const [currentEmbeddingModel, setCurrentEmbeddingModel] = useState<string | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [activeTab, setActiveTab] = useState<"memories" | "knowledge">("memories");
  const [newKBName, setNewKBName] = useState("");
  const [selectedKB, setSelectedKB] = useState<string | null>(null);
  const [kbEntries, setKBEntries] = useState<any[]>([]);
  const [newEntry, setNewEntry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [reembedding, setReembedding] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const fetchMemories = useCallback(async () => {
    try {
      const res = await fetch("/api/memory");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (data.memories && Array.isArray(data.memories)) {
        setMemories(data.memories);
        setCurrentEmbeddingModel(data.currentEmbeddingModel || null);
      } else if (Array.isArray(data)) {
        setMemories(data);
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch memories");
    }
  }, []);

  const fetchKnowledgeBases = useCallback(async () => {
    try {
      const res = await fetch("/api/memory/knowledge-bases");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (Array.isArray(data)) {
        setKnowledgeBases(data);
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch knowledge bases");
    }
  }, []);

  const fetchEntries = useCallback(async (kbId: string) => {
    try {
      const res = await fetch(`/api/memory/knowledge-bases/${kbId}/entries`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else if (Array.isArray(data)) {
        setKBEntries(data);
      }
    } catch (e: any) {
      setError(e.message || "Failed to fetch entries");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchMemories();
      fetchKnowledgeBases();
    }
  }, [isOpen, fetchMemories, fetchKnowledgeBases]);

  const activeTabRef = useRef(activeTab);
  const selectedKBRef = useRef(selectedKB);
  activeTabRef.current = activeTab;
  selectedKBRef.current = selectedKB;

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      fetchMemories();
      if (activeTabRef.current === "knowledge" && selectedKBRef.current) {
        fetchEntries(selectedKBRef.current);
      } else if (activeTabRef.current === "knowledge") {
        fetchKnowledgeBases();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [isOpen, fetchMemories, fetchKnowledgeBases, fetchEntries]);

  const deleteMemory = async (id: string) => {
    setError(null);
    try {
      await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch (e: any) {
      setError(e.message || "Failed to delete memory");
    }
  };

  const deleteByModel = async (model: string | null) => {
    setError(null);
    try {
      await fetch("/api/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeddingModel: model }),
      });
      fetchMemories();
    } catch (e: any) {
      setError(e.message || "Failed to delete memories");
    }
  };

  const reembedByModel = async (oldModel: string | null) => {
    const key = oldModel ?? "__null__";
    setReembedding(key);
    setError(null);
    try {
      // Fetch settings to check if we should use client-side Ollama
      const settingsRes = await fetch("/api/settings");
      const settings = await settingsRes.json();
      const useClientOllama =
        settings.embeddingMode === "local" &&
        settings.localEmbeddingBackend === "ollama";

      if (useClientOllama) {
        // Client-side re-embedding via local Ollama
        const targetModel = settings.localEmbeddingModel || "nomic-embed-text";
        const ollamaUrl = settings.ollamaBaseUrl || "http://localhost:11434";

        // Get memories that need re-embedding
        const memoriesToReembed = memories.filter((m) =>
          oldModel === null ? !m.embeddingModel : m.embeddingModel === oldModel
        );

        if (memoriesToReembed.length === 0) {
          fetchMemories();
          return;
        }

        let done = 0;
        for (const memory of memoriesToReembed) {
          try {
            // Call Ollama embedding API directly from browser
            const embedRes = await fetch(`${ollamaUrl}/api/embed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ model: targetModel, input: memory.content }),
            });
            if (!embedRes.ok) throw new Error(`Ollama error: ${embedRes.status}`);
            const embedData = await embedRes.json();
            const embedding = embedData.embeddings?.[0];
            if (!embedding) throw new Error("No embedding returned");

            // Save to server
            await fetch("/api/memory/reembed-update", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: memory.id, embedding, model: targetModel }),
            });
            done++;
          } catch (e: any) {
            console.error(`Failed to re-embed memory ${memory.id}:`, e);
          }
        }

        if (done > 0) fetchMemories();
        if (done < memoriesToReembed.length) {
          setError(`Re-embedded ${done}/${memoriesToReembed.length} memories. Some failed — is Ollama running with ${targetModel}?`);
        }
      } else {
        // Server-side re-embedding for cloud providers
        const res = await fetch("/api/memory/reembed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ oldModel }),
        });
        const data = await res.json();
        if (data.error) {
          setError(data.error);
        } else {
          fetchMemories();
        }
      }
    } catch (e: any) {
      setError(e.message || "Failed to re-embed memories");
    } finally {
      setReembedding(null);
    }
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const createKB = async () => {
    if (!newKBName.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/memory/knowledge-bases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newKBName.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setNewKBName("");
        fetchKnowledgeBases();
      }
    } catch (e: any) {
      setError(e.message || "Failed to create knowledge base");
    } finally {
      setLoading(false);
    }
  };

  const deleteKB = async (id: string) => {
    setError(null);
    try {
      await fetch(`/api/memory/knowledge-bases/${id}`, { method: "DELETE" });
      if (selectedKB === id) setSelectedKB(null);
      fetchKnowledgeBases();
    } catch (e: any) {
      setError(e.message || "Failed to delete knowledge base");
    }
  };

  const addEntry = async () => {
    if (!selectedKB || !newEntry.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/memory/knowledge-bases/${selectedKB}/entries`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: newEntry.trim() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setNewEntry("");
        fetchEntries(selectedKB);
      }
    } catch (e: any) {
      setError(e.message || "Failed to add entry");
    } finally {
      setLoading(false);
    }
  };

  // Split memories into active vs invalidated groups
  const activeMemories = memories.filter(
    (m) => m.embeddingModel === currentEmbeddingModel || m.embeddingModel === null
  );
  const invalidatedMemories = memories.filter(
    (m) => m.embeddingModel !== null && m.embeddingModel !== currentEmbeddingModel
  );

  // Group invalidated memories by model
  const invalidatedByModel = new Map<string, MemoryItem[]>();
  for (const m of invalidatedMemories) {
    const key = m.embeddingModel!;
    if (!invalidatedByModel.has(key)) invalidatedByModel.set(key, []);
    invalidatedByModel.get(key)!.push(m);
  }

  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  if (!isOpen) return null;

  const panelContent = (
    <>
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
        {error && (
          <div className="mx-3 mt-2 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
            {error}
            <button
              className="ml-2 underline"
              onClick={() => setError(null)}
            >
              dismiss
            </button>
          </div>
        )}
        {activeTab === "memories" && (
          <div className="p-3 space-y-2">
            {currentEmbeddingModel && (
              <div className="text-[10px] text-muted-foreground">
                Current model: {currentEmbeddingModel}
              </div>
            )}

            <Separator />

            {activeMemories.map((m) => (
              <div
                key={m.id}
                className="group relative rounded-md border border-border p-2 text-xs"
              >
                <button
                  className="absolute right-1 top-1 rounded p-0.5 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                  onClick={() => deleteMemory(m.id)}
                  title="Delete memory"
                >
                  <X className="h-3 w-3" />
                </button>
                <div className="pr-4">{m.content}</div>
                {m.strength !== undefined && (
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Strength: {m.strength.toFixed(2)} | Accessed:{" "}
                    {m.accessCount}x
                  </div>
                )}
              </div>
            ))}
            {activeMemories.length === 0 && invalidatedMemories.length === 0 && (
              <div className="py-4 text-center text-xs text-muted-foreground">
                No memories yet. Chat to build up context.
              </div>
            )}

            {Array.from(invalidatedByModel.entries()).map(([model, modelMemories]) => {
              const groupKey = model;
              const isExpanded = expandedGroups.has(groupKey);
              const isReembeddingThis = reembedding === groupKey;

              return (
                <div key={groupKey} className="mt-3">
                  <button
                    className="flex w-full items-center gap-1.5 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-500/20 transition-colors"
                    onClick={() => toggleGroup(groupKey)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3 shrink-0" />
                    ) : (
                      <ChevronRight className="h-3 w-3 shrink-0" />
                    )}
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate font-medium">{model}</span>
                    <span className="ml-auto shrink-0 text-[10px] opacity-75">
                      {modelMemories.length} invalidated
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="mt-1 space-y-1">
                      <div className="flex gap-1 px-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 text-[10px]"
                          onClick={() => reembedByModel(model)}
                          disabled={isReembeddingThis}
                        >
                          <RefreshCw className={`mr-1 h-2.5 w-2.5 ${isReembeddingThis ? "animate-spin" : ""}`} />
                          {isReembeddingThis ? "Re-embedding..." : "Re-embed All"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 flex-1 text-[10px] text-destructive hover:text-destructive"
                          onClick={() => deleteByModel(model)}
                        >
                          <Trash2 className="mr-1 h-2.5 w-2.5" />
                          Delete All
                        </Button>
                      </div>
                      {modelMemories.map((m) => (
                        <div
                          key={m.id}
                          className="group relative rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs opacity-70"
                        >
                          <button
                            className="absolute right-1 top-1 rounded p-0.5 text-destructive opacity-0 transition-opacity hover:bg-destructive/10 group-hover:opacity-100"
                            onClick={() => deleteMemory(m.id)}
                            title="Delete memory"
                          >
                            <X className="h-3 w-3" />
                          </button>
                          <div className="pr-4">{m.content}</div>
                          {m.strength !== undefined && (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              Strength: {m.strength.toFixed(2)} | Accessed:{" "}
                              {m.accessCount}x
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
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
                    onKeyDown={(e) => e.key === "Enter" && !loading && createKB()}
                    disabled={loading}
                  />
                  <Button size="sm" className="h-8" onClick={createKB} disabled={loading}>
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
                    <button
                      className="inline-flex h-6 w-6 items-center justify-center rounded-md text-destructive opacity-0 hover:bg-destructive/10 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteKB(kb.id);
                      }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
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
                    onKeyDown={(e) => e.key === "Enter" && !loading && addEntry()}
                    disabled={loading}
                  />
                  <Button size="sm" className="h-8" onClick={addEntry} disabled={loading}>
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
    </>
  );

  if (isMobile) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        {panelContent}
      </div>
    );
  }

  return (
    <div className="flex h-full w-80 flex-col border-l border-border bg-background">
      {panelContent}
    </div>
  );
}
