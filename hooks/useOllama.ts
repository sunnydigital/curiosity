"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const OLLAMA_BASE_URL = "http://localhost:11434";
const CHECK_INTERVAL = 30000;
const PERMISSION_KEY = "ollama-detection-allowed";

interface UseOllamaResult {
  isAvailable: boolean;
  models: string[];
  baseUrl: string;
  isLoading: boolean;
  permitted: boolean;
  allow: () => void;
  revoke: () => void;
  recheck: () => Promise<void>;
}

export function useOllama(): UseOllamaResult {
  const [permitted, setPermitted] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Read permission from localStorage on mount
  useEffect(() => {
    try {
      setPermitted(localStorage.getItem(PERMISSION_KEY) === "true");
    } catch {
      // localStorage unavailable
    }
  }, []);

  const check = useCallback(async () => {
    setIsLoading(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error("not ok");
      const data = await res.json();
      const modelNames: string[] = (data.models || []).map((m: any) => m.name);
      setModels(modelNames);
      setIsAvailable(true);
    } catch {
      setModels([]);
      setIsAvailable(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Start/stop polling based on permission
  useEffect(() => {
    if (!permitted) {
      setIsAvailable(false);
      setModels([]);
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    check();
    intervalRef.current = setInterval(check, CHECK_INTERVAL);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [permitted, check]);

  const allow = useCallback(() => {
    try { localStorage.setItem(PERMISSION_KEY, "true"); } catch {}
    setPermitted(true);
  }, []);

  const revoke = useCallback(() => {
    try { localStorage.removeItem(PERMISSION_KEY); } catch {}
    setPermitted(false);
    setIsAvailable(false);
    setModels([]);
  }, []);

  return { isAvailable, models, baseUrl: OLLAMA_BASE_URL, isLoading, permitted, allow, revoke, recheck: check };
}
