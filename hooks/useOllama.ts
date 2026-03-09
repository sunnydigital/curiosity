"use client";

import { useState, useEffect, useCallback, useRef } from "react";

const OLLAMA_BASE_URL = "http://localhost:11434";
const CHECK_INTERVAL = 30000;
const PERMISSION_KEY = "ollama-detection-allowed";

const EMBEDDING_KEYWORDS = ["embed", "minilm", "bge-", "snowflake-arctic-embed", "e5-", "gte-", "granite-embedding", "paraphrase-multilingual"];

function isEmbeddingModel(name: string): boolean {
  const lower = name.toLowerCase();
  return EMBEDDING_KEYWORDS.some((kw) => lower.includes(kw));
}

interface UseOllamaResult {
  isAvailable: boolean;
  models: string[];
  embeddingModels: string[];
  baseUrl: string;
  isLoading: boolean;
  permitted: boolean;
  allow: () => void;
  revoke: () => void;
  recheck: () => Promise<void>;
  lastError: string | null;
}

export function useOllama(): UseOllamaResult {
  const [permitted, setPermitted] = useState(false);
  const [isAvailable, setIsAvailable] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
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
    setLastError(null);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
        mode: "cors",
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const modelNames: string[] = (data.models || []).map((m: any) => m.name);
      setModels(modelNames);
      setIsAvailable(true);
    } catch (err: any) {
      const msg = err?.name === "AbortError" ? "Connection timed out" : err?.message || "Connection failed";
      console.warn(`[Ollama] Detection failed: ${msg}`);
      setLastError(msg);
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

  const embeddingModels = models.filter(isEmbeddingModel);

  return { isAvailable, models, embeddingModels, baseUrl: OLLAMA_BASE_URL, isLoading, permitted, allow, revoke, recheck: check, lastError };
}
