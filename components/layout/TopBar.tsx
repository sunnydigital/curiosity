"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Settings, GitBranch, Brain, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/ThemeProvider";

export function TopBar() {
  const [settings, setSettings] = useState<any>(null);
  const { theme, toggleTheme } = useTheme();
  const pathname = usePathname();

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

  return (
    <TooltipProvider>
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {settings?.activeProvider && (
              <>
                {settings.activeProvider} / {settings.activeModel}
              </>
            )}
          </span>
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
                  <Settings className="h-4 w-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  );
}
