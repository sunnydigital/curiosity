"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings as SettingsIcon, GitBranch, Brain, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";
import { ProviderSwitcher } from "@/components/chat/ProviderSwitcher";
import { UserMenu } from "@/components/auth/UserMenu";
import { DEFAULT_MODELS } from "@/lib/llm/model-equivalents";
import { useOllama } from "@/hooks/useOllama";
import type { LLMProviderName, Settings } from "@/types";

export function TopBar() {
  const [settings, setSettings] = useState<any>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();
  const ollama = useOllama();

  const fetchSettings = useCallback(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings)
      .catch(() => {});
  }, []);

  // Re-fetch settings whenever the route changes (e.g. navigating back from /settings)
  useEffect(() => {
    fetchSettings();
  }, [pathname, fetchSettings]);

  // Check auth status
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => setIsAuthenticated(data.authenticated))
      .catch(() => setIsAuthenticated(false));
  }, [pathname]);

  // Listen for provider-switched events (from Settings page or other sources)
  useEffect(() => {
    const handler = (e: Event) => {
      const { provider, model } = (e as CustomEvent).detail;
      setSettings((prev: any) =>
        prev ? { ...prev, activeProvider: provider, activeModel: model } : prev
      );
    };
    window.addEventListener("provider-switched", handler);
    return () => window.removeEventListener("provider-switched", handler);
  }, []);

  const handleProviderSwitch = useCallback(
    async (provider: LLMProviderName) => {
      // Resolve the model from current state via the updater to avoid stale closures
      let model = DEFAULT_MODELS[provider];
      setSettings((prev: any) => {
        if (!prev) return prev;
        const defaultKey = `default${provider.charAt(0).toUpperCase() + provider.slice(1)}Model` as keyof Settings;
        model = (prev as any)[defaultKey] || DEFAULT_MODELS[provider];
        return { ...prev, activeProvider: provider, activeModel: model };
      });
      try {
        await fetch("/api/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activeProvider: provider, activeModel: model }),
        });
        // Notify ChatView of the switch
        window.dispatchEvent(
          new CustomEvent("provider-switched", { detail: { provider, model } })
        );
      } catch {
        // Best-effort persist
      }
    },
    []
  );

  return (
    <TooltipProvider>
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          {isAuthenticated && settings?.activeProvider && (
            <ProviderSwitcher
              activeProvider={settings.activeProvider}
              onSwitch={handleProviderSwitch}
            />
          )}
          {isAuthenticated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1.5">
              {settings?.activeModel}
              {settings?.activeProvider === "ollama" && ollama.permitted && ollama.isAvailable && (
                <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 px-1.5 py-0 text-[10px] font-medium text-green-700">
                  Connected
                </span>
              )}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={toggleTheme}>
                {theme === "dark" ? (
                  <Sun className="h-4 w-4" />
                ) : (
                  <Moon className="h-4 w-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" id="tree-toggle-btn">
                <GitBranch className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle Tree View</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" id="memory-toggle-btn">
                <Brain className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Memory Panel</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/settings">
                <Button variant="ghost" size="icon">
                  <SettingsIcon className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <UserMenu />
        </div>
      </div>
    </TooltipProvider>
  );
}
