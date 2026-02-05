"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

type Theme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  setTheme: () => { },
  toggleTheme: () => { },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("curiosity-theme") as Theme | null;
    if (stored === "light" || stored === "dark") {
      setThemeState(stored);
    }
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const root = document.documentElement;
    root.classList.remove("light", "dark");
    root.classList.add(theme);
    localStorage.setItem("curiosity-theme", theme);
  }, [theme, mounted]);

  // Preload all available models from PI providers on app mount
  useEffect(() => {
    const preloadModels = async () => {
      const providers = ["openai", "anthropic", "gemini"];

      // Fetch models for all PI providers in parallel
      const fetchPromises = providers.map((provider) =>
        fetch(`/api/models/${provider}`)
          .then((r) => r.json())
          .then((data) => {
            console.log(`[ThemeProvider] Preloaded ${data.models?.length || 0} models for ${provider}`);
            return data;
          })
          .catch((err) => {
            console.warn(`[ThemeProvider] Failed to preload models for ${provider}:`, err);
          })
      );

      await Promise.all(fetchPromises);
    };

    preloadModels();
  }, []);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () =>
    setThemeState((prev) => (prev === "dark" ? "light" : "dark"));

  // Prevent flash of wrong theme by not rendering until mounted
  if (!mounted) {
    return (
      <html lang="en" className="dark" suppressHydrationWarning>
        <body className="antialiased" suppressHydrationWarning />
      </html>
    );
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
