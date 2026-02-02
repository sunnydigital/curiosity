"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { SubscriptionBadge } from "@/components/settings/SubscriptionBadge";
import { ArrowLeft, Check, Eye, EyeOff, Trash2, LogIn, LogOut, GripVertical } from "lucide-react";
import type { Settings, LLMProviderName, AuthMode, SubscriptionTier } from "@/types";

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

interface OAuthProviderStatus {
  connected: boolean;
  tier: SubscriptionTier | null;
  available: boolean;
}

type OAuthStatusMap = Record<string, OAuthProviderStatus>;

// Extended settings type that includes server-injected oauthStatus
interface SettingsWithOAuth extends Settings {
  oauthStatus?: OAuthStatusMap;
}

export default function SettingsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [settings, setSettings] = useState<SettingsWithOAuth | null>(null);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [ollamaLoading, setOllamaLoading] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusMap>({});
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);

  // Check for OAuth callback results in URL params
  useEffect(() => {
    const oauthResult = searchParams.get("oauth");
    const provider = searchParams.get("provider");
    if (oauthResult === "success" && provider) {
      setOauthMessage(`Successfully connected to ${provider}`);
      setTimeout(() => setOauthMessage(null), 5000);
    } else if (oauthResult === "error" && provider) {
      const reason = searchParams.get("reason") || "unknown error";
      setError(`OAuth failed for ${provider}: ${reason}`);
    }
  }, [searchParams]);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data) => {
        if (data.oauthStatus) {
          setOauthStatus(data.oauthStatus);
        }
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
      if (data.oauthStatus) {
        setOauthStatus(data.oauthStatus);
      }
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
      summarySentences: settings.summarySentences,
      failoverEnabled: settings.failoverEnabled,
      failoverChain: settings.failoverChain,
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

  const handleOAuthDisconnect = async (provider: LLMProviderName) => {
    try {
      const res = await fetch(`/api/oauth/${provider}/disconnect`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to disconnect");
      setOauthStatus((prev) => ({
        ...prev,
        [provider]: { ...prev[provider], connected: false, tier: null },
      }));
      setSettings((prev) =>
        prev
          ? { ...prev, [`${provider}AuthMode`]: "api_key" as AuthMode }
          : prev
      );
    } catch (e: any) {
      setError(e.message);
    }
  };

  const getAuthMode = (provider: LLMProviderName): AuthMode => {
    if (!settings) return "api_key";
    const key = `${provider}AuthMode` as keyof Settings;
    return (settings[key] as AuthMode) || "api_key";
  };

  const moveFailoverProvider = (index: number, direction: "up" | "down") => {
    if (!settings) return;
    const chain = [...settings.failoverChain];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= chain.length) return;
    [chain[index], chain[newIndex]] = [chain[newIndex], chain[index]];
    setSettings({ ...settings, failoverChain: chain });
    persistSettings({ failoverChain: chain });
  };

  const toggleFailoverProvider = (provider: LLMProviderName) => {
    if (!settings) return;
    const chain = [...settings.failoverChain];
    const index = chain.indexOf(provider);
    if (index >= 0) {
      chain.splice(index, 1);
    } else {
      chain.push(provider);
    }
    setSettings({ ...settings, failoverChain: chain });
    persistSettings({ failoverChain: chain });
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

        {oauthMessage && (
          <div className="mb-4 rounded-md border border-green-500/50 bg-green-500/10 p-3 text-sm text-green-700">
            {oauthMessage}
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
                <div className="flex items-center justify-between">
                  <span>{p.label}</span>
                  {oauthStatus[p.name]?.connected && (
                    <SubscriptionBadge
                      tier={oauthStatus[p.name]?.tier || null}
                      provider={p.name}
                    />
                  )}
                </div>
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

        {/* Provider Failover */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Provider Failover</h2>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm">Enable Automatic Failover</div>
                <div className="text-xs text-muted-foreground">
                  Automatically try alternate providers if the primary fails
                </div>
              </div>
              <Switch
                checked={settings.failoverEnabled}
                onCheckedChange={(checked: boolean) => {
                  setSettings({ ...settings, failoverEnabled: checked });
                  persistSettings({ failoverEnabled: checked });
                }}
              />
            </div>

            {settings.failoverEnabled && (
              <div className="rounded-md border border-border p-3">
                <div className="mb-2 text-xs text-muted-foreground">
                  Failover priority (primary provider is always tried first):
                </div>
                <div className="space-y-1">
                  {PROVIDERS.filter((p) => p.name !== settings.activeProvider).map((p) => {
                    const isInChain = settings.failoverChain.includes(p.name);
                    const chainIndex = settings.failoverChain.indexOf(p.name);
                    return (
                      <div
                        key={p.name}
                        className={`flex items-center justify-between rounded px-2 py-1.5 text-sm ${isInChain ? "bg-accent" : ""
                          }`}
                      >
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={isInChain}
                            onChange={() => toggleFailoverProvider(p.name)}
                            className="rounded"
                          />
                          <span>{p.label}</span>
                          {oauthStatus[p.name]?.connected && (
                            <SubscriptionBadge
                              tier={oauthStatus[p.name]?.tier || null}
                              provider={p.name}
                            />
                          )}
                        </div>
                        {isInChain && (
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground mr-1">
                              #{chainIndex + 1}
                            </span>
                            <button
                              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={chainIndex === 0}
                              onClick={() => moveFailoverProvider(chainIndex, "up")}
                            >
                              <GripVertical className="h-3 w-3 rotate-180" />
                            </button>
                            <button
                              className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30"
                              disabled={chainIndex === settings.failoverChain.length - 1}
                              onClick={() => moveFailoverProvider(chainIndex, "down")}
                            >
                              <GripVertical className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>

        <Separator className="my-6" />

        {/* Auto-Summary */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Auto-Summary</h2>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Summary Length:{" "}
              <span className="font-medium text-foreground">
                {settings.summarySentences} sentence{settings.summarySentences === 1 ? "" : "s"}
              </span>
            </label>
            <input
              type="range"
              min={1}
              max={10}
              step={1}
              value={settings.summarySentences}
              onChange={(e) => {
                const value = parseInt(e.target.value, 10);
                setSettings({ ...settings, summarySentences: value });
              }}
              onMouseUp={(e) => {
                persistSettings({ summarySentences: parseInt((e.target as HTMLInputElement).value, 10) });
              }}
              onTouchEnd={(e) => {
                persistSettings({ summarySentences: parseInt((e.target as HTMLInputElement).value, 10) });
              }}
              className="w-full accent-primary"
            />
            <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
              <span>1</span>
              <span>5</span>
              <span>10</span>
            </div>
          </div>
        </section>

        <Separator className="my-6" />

        {/* Authentication */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Authentication</h2>
          <div className="space-y-4">
            {PROVIDERS.filter((p) => p.name !== "ollama").map((p) => {
              const authMode = getAuthMode(p.name);
              const providerOAuth = oauthStatus[p.name];
              const oauthAvailable = providerOAuth?.available ?? false;
              const oauthClientIdKey = `${p.name}OauthClientId`;
              const oauthClientSecretKey = `${p.name}OauthClientSecret`;
              const hasOAuthCredentials = oauthAvailable || !!(apiKeys[oauthClientIdKey] && apiKeys[oauthClientSecretKey]);

              return (
                <div key={p.name} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      {providerOAuth?.connected && (
                        <SubscriptionBadge
                          tier={providerOAuth.tier}
                          provider={p.name}
                        />
                      )}
                    </div>
                    {/* Auth mode toggle */}
                    <div className="flex rounded-md border border-input text-xs">
                      <button
                        className={`rounded-l-md px-2.5 py-1 transition-colors ${authMode === "api_key"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                          }`}
                        onClick={() => {
                          const key = `${p.name}AuthMode` as keyof Settings;
                          setSettings({ ...settings, [key]: "api_key" as AuthMode });
                          persistSettings({ [key]: "api_key" });
                        }}
                      >
                        API Key
                      </button>
                      <button
                        className={`rounded-r-md px-2.5 py-1 transition-colors ${authMode === "oauth"
                          ? "bg-primary text-primary-foreground"
                          : "hover:bg-accent"
                          }`}
                        onClick={() => {
                          const key = `${p.name}AuthMode` as keyof Settings;
                          setSettings({ ...settings, [key]: "oauth" as AuthMode });
                          persistSettings({ [key]: "oauth" });
                        }}
                      >
                        OAuth
                      </button>
                    </div>
                  </div>

                  {authMode === "api_key" ? (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Input
                          type={showKeys[p.keyField] ? "text" : "password"}
                          value={apiKeys[p.keyField] ?? ""}
                          onChange={(e) =>
                            setApiKeys({ ...apiKeys, [p.keyField]: e.target.value })
                          }
                          placeholder={
                            (settings as any)[p.keyField]
                              ? "Key saved — enter a new key to replace"
                              : `Enter ${p.label} API key...`
                          }
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
                  ) : providerOAuth?.connected ? (
                    <div className="flex items-center justify-between">
                      <div className="text-xs text-muted-foreground">
                        Authenticated via OAuth
                        {providerOAuth.tier && providerOAuth.tier !== "unknown"
                          ? ` (${providerOAuth.tier} plan)`
                          : ""}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-destructive hover:text-destructive"
                        onClick={() => handleOAuthDisconnect(p.name)}
                      >
                        <LogOut className="mr-1 h-3 w-3" />
                        Disconnect
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {!oauthAvailable && (
                        <>
                          <div className="text-xs text-muted-foreground">
                            Enter your OAuth app credentials to enable sign-in:
                          </div>
                          <div className="space-y-1.5">
                            <div className="relative">
                              <Input
                                type={showKeys[oauthClientIdKey] ? "text" : "password"}
                                value={apiKeys[oauthClientIdKey] ?? ""}
                                onChange={(e) =>
                                  setApiKeys({ ...apiKeys, [oauthClientIdKey]: e.target.value })
                                }
                                placeholder={
                                  (settings as any)[oauthClientIdKey]
                                    ? "Saved — enter new to replace"
                                    : "OAuth Client ID"
                                }
                                className="pr-10 text-xs"
                              />
                              <button
                                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setShowKeys({ ...showKeys, [oauthClientIdKey]: !showKeys[oauthClientIdKey] })
                                }
                              >
                                {showKeys[oauthClientIdKey] ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <div className="relative">
                              <Input
                                type={showKeys[oauthClientSecretKey] ? "text" : "password"}
                                value={apiKeys[oauthClientSecretKey] ?? ""}
                                onChange={(e) =>
                                  setApiKeys({ ...apiKeys, [oauthClientSecretKey]: e.target.value })
                                }
                                placeholder={
                                  (settings as any)[oauthClientSecretKey]
                                    ? "Saved — enter new to replace"
                                    : "OAuth Client Secret"
                                }
                                className="pr-10 text-xs"
                              />
                              <button
                                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setShowKeys({ ...showKeys, [oauthClientSecretKey]: !showKeys[oauthClientSecretKey] })
                                }
                              >
                                {showKeys[oauthClientSecretKey] ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                          </div>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={async () => {
                          // Save any unsaved OAuth credentials first
                          if (apiKeys[oauthClientIdKey] || apiKeys[oauthClientSecretKey]) {
                            const ok = await persistSettings({
                              [oauthClientIdKey]: apiKeys[oauthClientIdKey],
                              [oauthClientSecretKey]: apiKeys[oauthClientSecretKey],
                            });
                            if (!ok) return;
                          }
                          window.location.href = `/api/oauth/${p.name}/authorize`;
                        }}
                        disabled={!oauthAvailable && !hasOAuthCredentials}
                      >
                        <LogIn className="mr-1.5 h-3 w-3" />
                        {oauthAvailable ? `Sign in with ${p.label}` : "Save & Sign in"}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ollama (no auth needed) */}
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 text-sm font-medium">Ollama (Local)</div>
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
                    <option value="anthropic">Anthropic (Voyage AI)</option>
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
