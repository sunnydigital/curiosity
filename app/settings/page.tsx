"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Check, Eye, EyeOff, Trash2 } from "lucide-react";
import type { Settings, LLMProviderName } from "@/types";

const PROVIDERS: { name: LLMProviderName; label: string; keyField: string }[] = [
  { name: "openai", label: "OpenAI", keyField: "openaiApiKey" },
  { name: "anthropic", label: "Anthropic (Claude)", keyField: "anthropicApiKey" },
  { name: "gemini", label: "Google (Gemini)", keyField: "geminiApiKey" },
  { name: "ollama", label: "Ollama (Local)", keyField: "ollamaBaseUrl" },
];

const STATIC_MODEL_OPTIONS: Record<LLMProviderName, string[]> = {
  openai: ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo", "o1-preview", "o1-mini"],
  anthropic: ["claude-opus-4-5-20251101", "claude-sonnet-4-20250514", "claude-haiku-3-5-20241022", "claude-3-5-sonnet-20241022"],
  gemini: ["gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
  ollama: [],
};

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        setSettings(data);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Fetch Ollama models when provider is ollama
  useEffect(() => {
    if (settings?.activeProvider === "ollama") {
      setOllamaLoading(true);
      fetch("/api/ollama-models")
        .then((r) => r.json())
        .then((data) => setOllamaModels(data.models || []))
        .catch(() => setOllamaModels([]))
        .finally(() => setOllamaLoading(false));
    }
  }, [settings?.activeProvider]);

  // Persist a partial settings update to the server immediately
  const persistSettings = async (updates: Record<string, any>) => {
    setError(null);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSettings(data);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
    }
  };

  const handleSave = async () => {
    if (!settings) return;

    const updates: any = {
      activeProvider: settings.activeProvider,
      activeModel: settings.activeModel,
      memoryEnabled: settings.memoryEnabled,
      embeddingProvider: settings.embeddingProvider,
      embeddingModel: settings.embeddingModel,
      previewProvider: settings.previewProvider,
      previewModel: settings.previewModel,
      decayLambda: settings.decayLambda,
      similarityWeight: settings.similarityWeight,
      temporalWeight: settings.temporalWeight,
    };

    // Only send API keys if they were changed (not masked)
    if (apiKeys.openaiApiKey) updates.openaiApiKey = apiKeys.openaiApiKey;
    if (apiKeys.anthropicApiKey) updates.anthropicApiKey = apiKeys.anthropicApiKey;
    if (apiKeys.geminiApiKey) updates.geminiApiKey = apiKeys.geminiApiKey;
    if (apiKeys.ollamaBaseUrl !== undefined)
      updates.ollamaBaseUrl = apiKeys.ollamaBaseUrl || settings.ollamaBaseUrl;

    const ok = await persistSettings(updates);
    if (ok) {
      setApiKeys({});
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  // Compute the model list for the current provider
  const modelOptions =
    settings?.activeProvider === "ollama"
      ? ollamaModels.length > 0
        ? ollamaModels
        : settings?.activeModel
          ? [settings.activeModel]
          : ["llama3.2"]
      : STATIC_MODEL_OPTIONS[settings?.activeProvider || "openai"];

  if (!settings) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-muted-foreground">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl p-6">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-semibold">Settings</h1>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* Provider Selection */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Active Provider</h2>
          <div className="grid grid-cols-2 gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.name}
                className={`rounded-md border p-3 text-left text-sm transition-colors ${settings.activeProvider === p.name
                  ? "border-primary bg-primary/10"
                  : "border-border hover:bg-accent"
                  }`}
                onClick={() => {
                  const newProvider = p.name;
                  const fallback = STATIC_MODEL_OPTIONS[newProvider][0];
                  // For ollama, keep current model if already ollama, or use first fetched model
                  const newModel =
                    newProvider === "ollama"
                      ? ollamaModels[0] || settings.activeModel
                      : fallback;
                  setSettings({
                    ...settings,
                    activeProvider: newProvider,
                    activeModel: newModel,
                  });
                  persistSettings({ activeProvider: newProvider, activeModel: newModel });
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </section>

        {/* Model Selection */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Model</h2>
          {settings.activeProvider === "ollama" && ollamaLoading ? (
            <div className="text-sm text-muted-foreground">Loading Ollama models...</div>
          ) : (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={settings.activeModel}
              onChange={(e) => {
                const newModel = e.target.value;
                setSettings({ ...settings, activeModel: newModel });
                persistSettings({ activeModel: newModel });
              }}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}
        </section>

        <Separator className="my-6" />

        {/* API Keys */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">API Keys</h2>
          <div className="space-y-3">
            {PROVIDERS.filter((p) => p.name !== "ollama").map((p) => (
              <div key={p.name}>
                <label className="mb-1 block text-xs text-muted-foreground">
                  {p.label} API Key
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showKeys[p.keyField] ? "text" : "password"}
                      value={
                        apiKeys[p.keyField] ??
                        (settings as any)[p.keyField] ??
                        ""
                      }
                      onChange={(e) =>
                        setApiKeys({ ...apiKeys, [p.keyField]: e.target.value })
                      }
                      placeholder={`Enter ${p.label} API key...`}
                      className="pr-10"
                    />
                    <button
                      className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                      onClick={() =>
                        setShowKeys({
                          ...showKeys,
                          [p.keyField]: !showKeys[p.keyField],
                        })
                      }
                    >
                      {showKeys[p.keyField] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Ollama Base URL
              </label>
              <Input
                value={apiKeys.ollamaBaseUrl ?? settings.ollamaBaseUrl}
                onChange={(e) =>
                  setApiKeys({ ...apiKeys, ollamaBaseUrl: e.target.value })
                }
                placeholder="http://localhost:11434"
              />
            </div>
          </div>
        </section>

        <Separator className="my-6" />

        {/* Memory Settings */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Memory System</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Enable Persistent Memory</div>
                <div className="text-xs text-muted-foreground">
                  Store and recall facts from previous chats
                </div>
              </div>
              <Switch
                checked={settings.memoryEnabled}
                onCheckedChange={(checked: boolean) =>
                  setSettings({ ...settings, memoryEnabled: checked })
                }
              />
            </div>

            {settings.memoryEnabled && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Embedding Provider
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={settings.embeddingProvider}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        embeddingProvider: e.target.value as LLMProviderName,
                      })
                    }
                  >
                    <option value="openai">OpenAI</option>
                    <option value="gemini">Gemini</option>
                    <option value="ollama">Ollama</option>
                  </select>
                </div>

                <div>
                  <label className="mb-1 block text-xs text-muted-foreground">
                    Preview Model Provider
                  </label>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={settings.previewProvider}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        previewProvider: e.target.value as LLMProviderName,
                      })
                    }
                  >
                    {PROVIDERS.map((p) => (
                      <option key={p.name} value={p.name}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Decay Lambda
                    </label>
                    <Input
                      type="number"
                      step="0.0000001"
                      value={settings.decayLambda}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          decayLambda: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Similarity Weight
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={settings.similarityWeight}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          similarityWeight: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted-foreground">
                      Temporal Weight
                    </label>
                    <Input
                      type="number"
                      step="0.1"
                      min="0"
                      max="1"
                      value={settings.temporalWeight}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          temporalWeight: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        <Separator className="my-6" />

        {/* Danger Zone */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-destructive">Danger Zone</h2>
          <div className="rounded-md border border-destructive/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Clear All Chats</div>
                <div className="text-xs text-muted-foreground">
                  Permanently delete all chat history. This cannot be undone.
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm("Are you sure you want to delete ALL chats? This cannot be undone.")) return;
                  try {
                    const res = await fetch("/api/chats", { method: "DELETE" });
                    if (!res.ok) throw new Error("Failed to clear chats");
                    window.dispatchEvent(new Event("refresh-sidebar"));
                    router.push("/");
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>
        </section>

        <div className="flex items-center gap-3 pb-6">
          <Button onClick={handleSave}>
            {saved ? (
              <>
                <Check className="mr-2 h-4 w-4" /> Saved
              </>
            ) : (
              "Save Settings"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
