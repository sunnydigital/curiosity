"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useTheme } from "@/components/ThemeProvider";
import { ArrowLeft, Check, Eye, EyeOff, LogIn, LogOut, GripVertical, KeyRound, ChevronDown, Loader2, Brain, MessageSquare, Wifi, WifiOff, Info, Copy } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { useOllama } from "@/hooks/useOllama";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import type { Settings, LLMProviderName, AuthMode, SubscriptionTier, EmbeddingMode, LocalEmbeddingBackend } from "@/types";
import { LOCAL_EMBEDDING_MODELS } from "@/types";

const PROVIDERS: { name: LLMProviderName; label: string; keyField: string }[] = [
  { name: "openai", label: "OpenAI", keyField: "openaiApiKey" },
  { name: "anthropic", label: "Anthropic (Claude)", keyField: "anthropicApiKey" },
  { name: "gemini", label: "Google (Gemini)", keyField: "geminiApiKey" },
  { name: "ollama", label: "Ollama (Local)", keyField: "ollamaBaseUrl" },
];

const FALLBACK_MODEL_OPTIONS: Record<LLMProviderName, string[]> = {
  openai: [
    "gpt-5.3-codex",
    "gpt-5.2",
    "gpt-5.2-pro",
    "gpt-5.2-codex",
    "gpt-5",
    "gpt-5-mini",
    "gpt-5-nano",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
    "gpt-4o",
    "gpt-4o-mini",
    "o3",
    "o4-mini",
    "o3-mini",
  ],
  anthropic: [
    "claude-opus-4-6",
    "claude-opus-4-5-20251101",
    "claude-sonnet-4-5-20250929",
    "claude-haiku-4-5-20251001",
    "claude-sonnet-4-20250514",
    "claude-opus-4-1-20250805",
    "claude-opus-4-20250514",
    "claude-3-7-sonnet-20250219",
    "claude-3-haiku-20240307",
  ],
  gemini: [
    "gemini-3-pro-preview",
    "gemini-3-flash-preview",
    "gemini-2.5-pro",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-pro",
    "gemini-1.5-flash",
  ],
  ollama: [],
};

const PROVIDER_COLORS: Record<string, string> = {
  openai: "#10a37f",
  anthropic: "#d97757",
  gemini: "#4285f4",
  ollama: "currentColor",
};

// Official SVG paths from Simple Icons (https://simpleicons.org), viewBox 0 0 24 24
const OPENAI_PATH =
  "M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z";

const CLAUDE_PATH =
  "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z";

const OLLAMA_PATH =
  "M7.905 1.09c.216.085.411.225.588.41.295.306.544.744.734 1.263.191.522.315 1.1.362 1.68a5.054 5.054 0 012.049-.636l.051-.004c.87-.07 1.73.087 2.48.474.101.053.2.11.297.17.05-.569.172-1.134.36-1.644.19-.52.439-.957.733-1.264a1.67 1.67 0 01.589-.41c.257-.1.53-.118.796-.042.401.114.745.368 1.016.737.248.337.434.769.561 1.287.23.934.27 2.163.115 3.645l.053.04.026.019c.757.576 1.284 1.397 1.563 2.35.435 1.487.216 3.155-.534 4.088l-.018.021.002.003c.417.762.67 1.567.724 2.4l.002.03c.064 1.065-.2 2.137-.814 3.19l-.007.01.01.024c.472 1.157.62 2.322.438 3.486l-.006.039a.651.651 0 01-.747.536.648.648 0 01-.54-.742c.167-1.033.01-2.069-.48-3.123a.643.643 0 01.04-.617l.004-.006c.604-.924.854-1.83.8-2.72-.046-.779-.325-1.544-.8-2.273a.644.644 0 01.18-.886l.009-.006c.243-.159.467-.565.58-1.12a4.229 4.229 0 00-.095-1.974c-.205-.7-.58-1.284-1.105-1.683-.595-.454-1.383-.673-2.38-.61a.653.653 0 01-.632-.371c-.314-.665-.772-1.141-1.343-1.436a3.288 3.288 0 00-1.772-.332c-1.245.099-2.343.801-2.67 1.686a.652.652 0 01-.61.425c-1.067.002-1.893.252-2.497.703-.522.39-.878.935-1.066 1.588a4.07 4.07 0 00-.068 1.886c.112.558.331 1.02.582 1.269l.008.007c.212.207.257.53.109.785-.36.622-.629 1.549-.673 2.44-.05 1.018.186 1.902.719 2.536l.016.019a.643.643 0 01.095.69c-.576 1.236-.753 2.252-.562 3.052a.652.652 0 01-1.269.298c-.243-1.018-.078-2.184.473-3.498l.014-.035-.008-.012a4.339 4.339 0 01-.598-1.309l-.005-.019a5.764 5.764 0 01-.177-1.785c.044-.91.278-1.842.622-2.59l.012-.026-.002-.002c-.293-.418-.51-.953-.63-1.545l-.005-.024a5.352 5.352 0 01.093-2.49c.262-.915.777-1.701 1.536-2.269.06-.045.123-.09.186-.132-.159-1.493-.119-2.73.112-3.67.127-.518.314-.95.562-1.287.27-.368.614-.622 1.015-.737.266-.076.54-.059.797.042zm4.116 9.09c.936 0 1.8.313 2.446.855.63.527 1.005 1.235 1.005 1.94 0 .888-.406 1.58-1.133 2.022-.62.375-1.451.557-2.403.557-1.009 0-1.871-.259-2.493-.734-.617-.47-.963-1.13-.963-1.845 0-.707.398-1.417 1.056-1.946.668-.537 1.55-.849 2.485-.849zm0 .896a3.07 3.07 0 00-1.916.65c-.461.37-.722.835-.722 1.25 0 .428.21.829.61 1.134.455.347 1.124.548 1.943.548.799 0 1.473-.147 1.932-.426.463-.28.7-.686.7-1.257 0-.423-.246-.89-.683-1.256-.484-.405-1.14-.643-1.864-.643zm.662 1.21l.004.004c.12.151.095.37-.056.49l-.292.23v.446a.375.375 0 01-.376.373.375.375 0 01-.376-.373v-.46l-.271-.218a.347.347 0 01-.052-.49.353.353 0 01.494-.051l.215.172.22-.174a.353.353 0 01.49.051zm-5.04-1.919c.478 0 .867.39.867.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zm8.706 0c.48 0 .868.39.868.871a.87.87 0 01-.868.871.87.87 0 01-.867-.87.87.87 0 01.867-.872zM7.44 2.3l-.003.002a.659.659 0 00-.285.238l-.005.006c-.138.189-.258.467-.348.832-.17.692-.216 1.631-.124 2.782.43-.128.899-.208 1.404-.237l.01-.001.019-.034c.046-.082.095-.161.148-.239.123-.771.022-1.692-.253-2.444-.134-.364-.297-.65-.453-.813a.628.628 0 00-.107-.09L7.44 2.3zm9.174.04l-.002.001a.628.628 0 00-.107.09c-.156.163-.32.45-.453.814-.29.794-.387 1.776-.23 2.572l.058.097.008.014h.03a5.184 5.184 0 011.466.212c.086-1.124.038-2.043-.128-2.722-.09-.365-.21-.643-.349-.832l-.004-.006a.659.659 0 00-.285-.239h-.004z";

const GEMINI_PATH =
  "M20.616 10.835a14.147 14.147 0 01-4.45-3.001 14.111 14.111 0 01-3.678-6.452.503.503 0 00-.975 0 14.134 14.134 0 01-3.679 6.452 14.155 14.155 0 01-4.45 3.001c-.65.28-1.318.505-2.002.678a.502.502 0 000 .975c.684.172 1.35.397 2.002.677a14.147 14.147 0 014.45 3.001 14.112 14.112 0 013.679 6.453.502.502 0 00.975 0c.172-.685.397-1.351.677-2.003a14.145 14.145 0 013.001-4.45 14.113 14.113 0 016.453-3.678.503.503 0 000-.975 13.245 13.245 0 01-2.003-.678z";

function ProviderIcon({ provider, active }: { provider: LLMProviderName; active?: boolean }) {
  const { theme } = useTheme();
  const cls = `h-4 w-4 shrink-0 transition-colors ${active ? "" : "text-muted-foreground"}`;
  if (provider === "ollama") {
    if (!active) {
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <path d={OLLAMA_PATH} />
        </svg>
      );
    }
    const ollamaFill = theme === "dark" ? "#ffffff" : "#000000";
    return (
      <svg viewBox="0 0 24 24" className={cls} fill={ollamaFill}>
        <path d={OLLAMA_PATH} />
      </svg>
    );
  }
  if (provider === "gemini") {
    if (!active) {
      return (
        <svg viewBox="0 0 24 24" className={cls} fill="currentColor">
          <path d={GEMINI_PATH} />
        </svg>
      );
    }
    return (
      <svg viewBox="0 0 24 24" className={cls} fill="none">
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id="gemini-st-g0" x1="7" x2="11" y1="15.5" y2="12">
            <stop stopColor="#08B962" />
            <stop offset="1" stopColor="#08B962" stopOpacity="0" />
          </linearGradient>
          <linearGradient gradientUnits="userSpaceOnUse" id="gemini-st-g1" x1="8" x2="11.5" y1="5.5" y2="11">
            <stop stopColor="#F94543" />
            <stop offset="1" stopColor="#F94543" stopOpacity="0" />
          </linearGradient>
          <linearGradient gradientUnits="userSpaceOnUse" id="gemini-st-g2" x1="3.5" x2="17.5" y1="13.5" y2="12">
            <stop stopColor="#FABC12" />
            <stop offset=".46" stopColor="#FABC12" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={GEMINI_PATH} fill="#3186FF" />
        <path d={GEMINI_PATH} fill="url(#gemini-st-g0)" />
        <path d={GEMINI_PATH} fill="url(#gemini-st-g1)" />
        <path d={GEMINI_PATH} fill="url(#gemini-st-g2)" />
      </svg>
    );
  }
  const fill = active ? PROVIDER_COLORS[provider] : "currentColor";
  const path = provider === "openai" ? OPENAI_PATH : CLAUDE_PATH;
  return (
    <svg viewBox="0 0 24 24" className={cls} fill={fill}>
      <path d={path} />
    </svg>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="rounded p-1 hover:bg-muted/80 transition-colors"
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3 text-muted-foreground" />}
    </button>
  );
}

function OllamaSetupGuide({ onRetry, onDisconnect }: { onRetry: () => void; onDisconnect: () => void }) {
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Ollama not detected.{" "}
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="text-xs underline underline-offset-2 hover:text-foreground transition-colors"
        >
          {showGuide ? "Hide setup guide" : "Need help?"}
        </button>
      </p>

      {showGuide && (
        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-3">
          <p className="text-xs font-medium">
            Ollama needs to allow connections from this website. This is a one-time setup.
          </p>

          {/* macOS */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">macOS</p>
            <p className="text-[11px] text-muted-foreground">Run in Terminal, then quit &amp; relaunch Ollama:</p>
            <div className="flex items-center gap-1">
              <code className="rounded bg-muted px-2 py-1 text-[11px] font-mono select-all block">
                launchctl setenv OLLAMA_ORIGINS &quot;*&quot;
              </code>
              <CopyButton text='launchctl setenv OLLAMA_ORIGINS "*"' />
            </div>
          </div>

          {/* Windows */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Windows</p>
            <p className="text-[11px] text-muted-foreground">Run in PowerShell, then quit &amp; relaunch Ollama:</p>
            <div className="flex items-center gap-1">
              <code className="rounded bg-muted px-2 py-1 text-[11px] font-mono select-all block whitespace-nowrap">
                [System.Environment]::SetEnvironmentVariable(&quot;OLLAMA_ORIGINS&quot;, &quot;*&quot;, &quot;User&quot;)
              </code>
              <CopyButton text='[System.Environment]::SetEnvironmentVariable("OLLAMA_ORIGINS", "*", "User")' />
            </div>
          </div>

          {/* Linux */}
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-muted-foreground">Linux</p>
            <p className="text-[11px] text-muted-foreground">Edit the systemd service, then restart:</p>
            <div className="flex items-center gap-1">
              <code className="rounded bg-muted px-2 py-1 text-[11px] font-mono select-all block">
                sudo systemctl edit ollama
              </code>
              <CopyButton text="sudo systemctl edit ollama" />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Add: <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">Environment=&quot;OLLAMA_ORIGINS=*&quot;</code> under <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">[Service]</code>, then{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono">sudo systemctl restart ollama</code>
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="gap-1.5 text-xs"
        >
          <Wifi className="h-3.5 w-3.5" />
          Retry
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDisconnect}
          className="gap-1.5 text-xs text-muted-foreground"
        >
          <WifiOff className="h-3.5 w-3.5" />
          Disconnect
        </Button>
      </div>
    </div>
  );
}

function OllamaStatusBadge({ connected }: { connected: boolean | null }) {
  if (connected === null) return null;
  return connected ? (
    <span className="inline-flex items-center rounded-full border border-green-300 bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
      Connected
    </span>
  ) : (
    <span className="inline-flex items-center rounded-full border border-red-300 bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
      Not Connected
    </span>
  );
}

/**
 * Badge that indicates connection type with color coding:
 * - Blue: OAuth is the active auth method
 * - Yellow: API key is the active auth method
 * Color is determined by the current authMode toggle, not by which methods are available.
 */
function ConnectionBadge({
  hasApiKey,
  hasOAuth,
  tier,
  authMode,
}: {
  hasApiKey: boolean;
  hasOAuth: boolean;
  tier: SubscriptionTier | string | null;
  authMode: AuthMode;
}) {
  // Only show badge if the method matching the current auth mode is connected
  const isOAuthMode = authMode !== "api_key";
  const isConnected = isOAuthMode ? hasOAuth : hasApiKey;
  if (!isConnected) return null;

  const resolvedTier = tier || "unknown";
  const label =
    resolvedTier === "unknown" || !isOAuthMode
      ? "Connected"
      : ({ free: "Free", plus: "Plus", pro: "Pro", max: "Max", enterprise: "Enterprise" }[resolvedTier] || "Connected");

  const style = isOAuthMode
    ? "bg-blue-100 text-blue-700 border-blue-300"
    : "bg-yellow-100 text-yellow-700 border-yellow-300";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}

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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const ollama = useOllama();
  const ollamaModels = ollama.models;
  const ollamaLoading = ollama.isLoading;
  const ollamaConnected = ollama.permitted ? (ollama.isAvailable ? true : false) : null;
  const [oauthStatus, setOauthStatus] = useState<OAuthStatusMap>({});
  const [oauthMessage, setOauthMessage] = useState<string | null>(null);
  const [dynamicModels, setDynamicModels] = useState<Record<string, string[]>>({});
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({});
  const [oauthCode, setOauthCode] = useState("");
  const [oauthPending, setOauthPending] = useState<Record<string, boolean>>({});
  const [oauthSessionId, setOauthSessionId] = useState<Record<string, string>>({});
  const [oauthExchanging, setOauthExchanging] = useState<Record<string, boolean>>({});
  const [oauthInstructions, setOauthInstructions] = useState<Record<string, string>>({});
  const [oauthProgress, setOauthProgress] = useState<Record<string, string>>({});
  const [anthropicSetupToken, setAnthropicSetupToken] = useState("");
  const [anthropicSetupSaving, setAnthropicSetupSaving] = useState(false);
  const [defaultModelFocus, setDefaultModelFocus] = useState<Record<string, boolean>>({});
  const [previewModelFocus, setPreviewModelFocus] = useState<Record<string, boolean>>({});
  const [draggedProvider, setDraggedProvider] = useState<LLMProviderName | null>(null);
  const [ollamaEmbeddingModels, setOllamaEmbeddingModels] = useState<string[]>([]);
  const [ollamaEmbeddingConnected, setOllamaEmbeddingConnected] = useState<boolean | null>(null);
  const [authInfo, setAuthInfo] = useState<{ authenticated: boolean; isAdmin: boolean } | null>(null);
  const [adminApiKey, setAdminApiKey] = useState("");
  const [showAdminApiKey, setShowAdminApiKey] = useState(false);
  const [adminApiKeySaved, setAdminApiKeySaved] = useState(false);
  const [userApiKeys, setUserApiKeys] = useState<Record<string, string>>({});

  // Check auth status
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        setAuthInfo({ authenticated: data.authenticated, isAdmin: data.isAdmin || false });
        if (data.isAdmin) {
          // Fetch admin API key
          fetch("/api/settings")
            .then((r) => r.json())
            .then((s) => {
              if (s.anthropicApiKey) setAdminApiKey(s.anthropicApiKey);
            })
            .catch(() => {});
        }
      })
      .catch(() => setAuthInfo({ authenticated: false, isAdmin: false }));
  }, []);

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
        if (data.userApiKeys) {
          setUserApiKeys(data.userApiKeys);
        }
        setSettings(data);
      })
      .catch((e) => setError(e.message));
  }, []);

  // Auth modes where pi-ai starts a local callback server that may auto-capture the code
  const LOCAL_SERVER_AUTH_MODES = useRef(new Set(["oauth_openai_codex"]));

  // Poll for auto-completion when a local-server-based OAuth flow is pending.
  // pi-ai's local callback server (e.g. port 1455 for OpenAI Codex) may capture
  // the authorization code before the user pastes anything.
  useEffect(() => {
    // Find providers with pending OAuth that use a local callback server
    const pendingProviders = Object.entries(oauthPending)
      .filter(([name, pending]) => {
        if (!pending || !settings) return false;
        const authModeKey = `${name}AuthMode` as keyof Settings;
        const authMode = (settings[authModeKey] as AuthMode) || "api_key";
        return LOCAL_SERVER_AUTH_MODES.current.has(authMode);
      })
      .map(([name]) => ({ name: name as LLMProviderName, sessionId: oauthSessionId[name] }))
      .filter((p) => p.sessionId);

    if (pendingProviders.length === 0) return;

    const interval = setInterval(async () => {
      for (const { name, sessionId } of pendingProviders) {
        if (!oauthPending[name]) continue;
        const authModeKey = `${name}AuthMode` as keyof Settings;
        const authMode = settings ? (settings[authModeKey] as AuthMode) : "oauth";
        try {
          const res = await fetch(
            `/api/oauth/${name}/poll?sessionId=${sessionId}&authMode=${authMode}`
          );
          const data = await res.json();
          if (data.status === "complete") {
            setOauthPending((prev) => ({ ...prev, [name]: false }));
            setOauthCode("");
            const label = PROVIDERS.find((p) => p.name === name)?.label || name;
            setOauthMessage(`Successfully connected to ${label}`);
            setTimeout(() => setOauthMessage(null), 5000);
            // Refresh settings
            const settingsRes = await fetch("/api/settings");
            const settingsData = await settingsRes.json();
            if (settingsData.oauthStatus) setOauthStatus(settingsData.oauthStatus);
            setSettings(settingsData);
            if (settingsData.activeProvider) {
              window.dispatchEvent(
                new CustomEvent("provider-switched", {
                  detail: { provider: settingsData.activeProvider, model: settingsData.activeModel },
                })
              );
            }
          } else if (data.status === "expired") {
            // Session expired or lost (e.g. HMR in dev). Check if credentials
            // were actually stored before the session was cleaned up.
            try {
              const statusRes = await fetch("/api/oauth/status");
              const statusData = await statusRes.json();
              if (statusData[name]?.connected) {
                // Credentials were stored — treat as success
                setOauthPending((prev) => ({ ...prev, [name]: false }));
                const label = PROVIDERS.find((pp) => pp.name === name)?.label || name;
                setOauthMessage(`Successfully connected to ${label}`);
                setTimeout(() => setOauthMessage(null), 5000);
                const settingsRes = await fetch("/api/settings");
                const settingsData = await settingsRes.json();
                if (settingsData.oauthStatus) setOauthStatus(settingsData.oauthStatus);
                setSettings(settingsData);
                if (settingsData.activeProvider) {
                  window.dispatchEvent(
                    new CustomEvent("provider-switched", {
                      detail: { provider: settingsData.activeProvider, model: settingsData.activeModel },
                    })
                  );
                }
              } else {
                setOauthPending((prev) => ({ ...prev, [name]: false }));
                setError("OAuth session expired. Please try signing in again.");
              }
            } catch {
              setOauthPending((prev) => ({ ...prev, [name]: false }));
              setError("OAuth session expired. Please try signing in again.");
            }
          } else if (data.status === "error") {
            setOauthPending((prev) => ({ ...prev, [name]: false }));
            setOauthProgress((prev) => ({ ...prev, [name]: "" }));
            setError(data.error || "OAuth login failed. Please try again.");
          } else if (data.status === "pending" && data.progress) {
            setOauthProgress((prev) => ({ ...prev, [name]: data.progress }));
          }
        } catch {
          // Polling errors are non-fatal
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [oauthPending, oauthSessionId, settings]);

  // Listen for provider-switched events from TopBar so Settings page stays in sync
  useEffect(() => {
    const handler = (e: Event) => {
      const { provider, model } = (e as CustomEvent).detail;
      setSettings((prev) =>
        prev ? { ...prev, activeProvider: provider as LLMProviderName, activeModel: model } : prev
      );
    };
    window.addEventListener("provider-switched", handler);
    return () => window.removeEventListener("provider-switched", handler);
  }, []);

  // Ollama detection is now handled by the useOllama hook (client-side, permission-based)

  // Fetch Ollama embedding models on mount
  useEffect(() => {
    fetch("/api/ollama-models/embedding")
      .then((r) => r.json())
      .then((data) => {
        setOllamaEmbeddingModels(data.models || []);
        setOllamaEmbeddingConnected(data.connected ?? false);
      })
      .catch(() => {
        setOllamaEmbeddingModels([]);
        setOllamaEmbeddingConnected(false);
      });
  }, []);

  // Fetch models dynamically for all cloud providers once settings are loaded
  const modelsFetchedRef = useRef(false);
  useEffect(() => {
    if (!settings || modelsFetchedRef.current) return;
    modelsFetchedRef.current = true;

    const cloudProviders: LLMProviderName[] = ["openai", "anthropic", "gemini"];
    for (const provider of cloudProviders) {
      setModelsLoading((prev) => ({ ...prev, [provider]: true }));

      // Standard model fetching for all providers
      fetch(`/api/models/${provider}`)
        .then((r) => r.json())
        .then((data) => {
          const raw = data.models || [];
          const models: string[] = raw.map((m: any) => (typeof m === "string" ? m : m.id));
          if (models.length > 0) {
            setDynamicModels((prev) => ({ ...prev, [provider]: models }));
          }
        })
        .catch(() => { })
        .finally(() => setModelsLoading((prev) => ({ ...prev, [provider]: false })));
    }
  }, [settings]);

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
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      return true;
    } catch (e: any) {
      setError(e.message);
      return false;
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

  const reorderFailoverChain = (fromIndex: number, toIndex: number) => {
    if (!settings) return;
    if (fromIndex === toIndex) return;
    const chain = [...settings.failoverChain];
    const [moved] = chain.splice(fromIndex, 1);
    chain.splice(toIndex, 0, moved);
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
    // Auto-disable failover when no providers remain in the chain
    if (chain.length === 0) {
      setSettings({ ...settings, failoverChain: chain, failoverEnabled: false });
      persistSettings({ failoverChain: chain, failoverEnabled: false });
    } else {
      setSettings({ ...settings, failoverChain: chain });
      persistSettings({ failoverChain: chain });
    }
  };

  // Compute the model list for the current provider
  const activeProvider = settings?.activeProvider || "openai";

  const modelOptions =
    activeProvider === "ollama"
      ? ollamaModels.length > 0
        ? ollamaModels
        : settings?.activeModel
          ? [settings.activeModel]
          : ["llama3.2"]
      : dynamicModels[activeProvider] || FALLBACK_MODEL_OPTIONS[activeProvider];

  // Helper to get model options for any provider (for default/preview dropdowns)
  const getModelOptionsForProvider = (provider: LLMProviderName) => {
    if (provider === "ollama") {
      return ollamaModels.length > 0 ? ollamaModels : ["llama3.2"];
    }
    return dynamicModels[provider] || FALLBACK_MODEL_OPTIONS[provider];
  };

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
                  const models = dynamicModels[newProvider] || FALLBACK_MODEL_OPTIONS[newProvider];
                  const newModel =
                    newProvider === "ollama"
                      ? ollamaModels[0] || settings.activeModel
                      : models[0];
                  setSettings({
                    ...settings,
                    activeProvider: newProvider,
                    activeModel: newModel,
                  });
                  persistSettings({ activeProvider: newProvider, activeModel: newModel }).then((ok) => {
                    if (ok) {
                      window.dispatchEvent(
                        new CustomEvent("provider-switched", { detail: { provider: newProvider, model: newModel } })
                      );
                    }
                  });
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ProviderIcon provider={p.name} active={settings.activeProvider === p.name} />
                    <span>{p.label}</span>
                  </div>
                  {p.name === "ollama" ? (
                    <OllamaStatusBadge connected={ollamaConnected} />
                  ) : (
                    <ConnectionBadge
                      hasApiKey={!!userApiKeys[p.name]}
                      hasOAuth={!!oauthStatus[p.name]?.connected}
                      tier={oauthStatus[p.name]?.tier || null}
                      authMode={getAuthMode(p.name)}
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
          {(settings.activeProvider === "ollama" && ollamaLoading) || modelsLoading[settings.activeProvider] ? (
            <div className="text-sm text-muted-foreground">Loading models...</div>
          ) : (
            <select
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={settings.activeModel}
              onChange={(e) => {
                const newModel = e.target.value;
                setSettings({ ...settings, activeModel: newModel });
                persistSettings({ activeModel: newModel }).then((ok) => {
                  if (ok) {
                    window.dispatchEvent(
                      new CustomEvent("provider-switched", { detail: { provider: settings.activeProvider, model: newModel } })
                    );
                  }
                });
              }}
            >
              {modelOptions.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          )}

          {/* Default Models per Provider */}
          <h2 className="mb-3 mt-6 text-sm font-medium">Default Taskbar Model</h2>
          <p className="mb-2 text-xs text-muted-foreground">
            Default model shown for each provider in the taskbar menu
          </p>
          <div className="space-y-2">
            {(["openai", "anthropic", "gemini", "ollama"] as LLMProviderName[]).map((provider) => {
              const settingsKey = `default${provider.charAt(0).toUpperCase() + provider.slice(1)}Model` as keyof Settings;
              const currentValue = (settings as any)[settingsKey] as string;
              const options = getModelOptionsForProvider(provider);
              return (
                <div key={provider} className="flex items-center gap-2">
                  <ProviderIcon provider={provider} active={!!defaultModelFocus[provider]} />
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={currentValue}
                    onFocus={() => setDefaultModelFocus((prev) => ({ ...prev, [provider]: true }))}
                    onBlur={() => setDefaultModelFocus((prev) => ({ ...prev, [provider]: false }))}
                    onChange={(e) => {
                      const newModel = e.target.value;
                      const updates: Record<string, any> = { [settingsKey]: newModel };
                      // If this is the active provider, also update activeModel
                      if (provider === settings.activeProvider) {
                        updates.activeModel = newModel;
                        setSettings({ ...settings, [settingsKey]: newModel, activeModel: newModel });
                      } else {
                        setSettings({ ...settings, [settingsKey]: newModel });
                      }
                      persistSettings(updates).then((ok) => {
                        if (ok && provider === settings.activeProvider) {
                          window.dispatchEvent(
                            new CustomEvent("provider-switched", { detail: { provider, model: newModel } })
                          );
                        }
                      });
                    }}
                  >
                    {options.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>

          {/* Preview Model per Provider */}
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-medium">Preview Model</h2>
            <p className="mb-2 text-xs text-muted-foreground">
              Model used for chat previews and summaries
            </p>
            <div className="space-y-2">
              {(["openai", "anthropic", "gemini", "ollama"] as LLMProviderName[]).map((provider) => {
                const settingsKey = `preview${provider.charAt(0).toUpperCase() + provider.slice(1)}Model` as keyof Settings;
                const currentValue = (settings as any)[settingsKey] as string;
                const options = getModelOptionsForProvider(provider);
                const isActivePreview = provider === settings.previewProvider;
                return (
                  <div key={provider} className="flex items-center gap-2">
                    <button
                      type="button"
                      className="shrink-0"
                      title={`${isActivePreview ? "Active" : "Click to set as"} preview provider`}
                      onClick={() => {
                        setSettings({ ...settings, previewProvider: provider, previewModel: currentValue });
                        persistSettings({ previewProvider: provider, previewModel: currentValue });
                      }}
                    >
                      <ProviderIcon provider={provider} active={!!previewModelFocus[provider]} />
                    </button>
                    <select
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={currentValue}
                      onFocus={() => setPreviewModelFocus((prev) => ({ ...prev, [provider]: true }))}
                      onBlur={() => setPreviewModelFocus((prev) => ({ ...prev, [provider]: false }))}
                      onChange={(e) => {
                        const newModel = e.target.value;
                        const updates: Record<string, any> = { [settingsKey]: newModel };
                        if (isActivePreview) {
                          updates.previewModel = newModel;
                          setSettings({ ...settings, [settingsKey]: newModel, previewModel: newModel });
                        } else {
                          setSettings({ ...settings, [settingsKey]: newModel });
                        }
                        persistSettings(updates);
                      }}
                    >
                      {options.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
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
                  if (checked && settings.failoverChain.length === 0) {
                    // Default to ollama as the failover provider
                    const defaultChain: LLMProviderName[] = settings.activeProvider === "ollama"
                      ? []
                      : ["ollama"];
                    setSettings({ ...settings, failoverEnabled: true, failoverChain: defaultChain });
                    persistSettings({ failoverEnabled: true, failoverChain: defaultChain });
                  } else {
                    setSettings({ ...settings, failoverEnabled: checked });
                    persistSettings({ failoverEnabled: checked });
                  }
                }}
              />
            </div>

            {settings.failoverEnabled && (() => {
              // Effective chain: only providers that are not the active provider
              const effectiveChain = settings.failoverChain.filter(
                (name) => name !== settings.activeProvider
              );
              const nonActive = PROVIDERS.filter((p) => p.name !== settings.activeProvider);
              const inChain = effectiveChain
                .map((name) => nonActive.find((p) => p.name === name))
                .filter(Boolean) as typeof nonActive;
              const notInChain = nonActive.filter((p) => !effectiveChain.includes(p.name));
              const ordered = [...inChain, ...notInChain];

              return (
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 text-xs text-muted-foreground">
                    Failover priority (primary provider is always tried first):
                  </div>
                  <div className="space-y-1">
                    {ordered.map((p) => {
                      const isInChain = effectiveChain.includes(p.name);
                      // Position among checked items only (top item = #1)
                      const displayNumber = isInChain
                        ? inChain.findIndex((c) => c.name === p.name) + 1
                        : -1;
                      return (
                        <div
                          key={p.name}
                          draggable={isInChain}
                          onDragStart={(e) => {
                            setDraggedProvider(p.name);
                            e.dataTransfer.effectAllowed = "move";
                          }}
                          onDragEnd={() => setDraggedProvider(null)}
                          onDragOver={(e) => {
                            if (!isInChain) return;
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                          }}
                          onDrop={(e) => {
                            e.preventDefault();
                            if (!draggedProvider || !isInChain) return;
                            const fromIndex = effectiveChain.indexOf(draggedProvider);
                            const toIndex = effectiveChain.indexOf(p.name);
                            reorderFailoverChain(fromIndex, toIndex);
                            setDraggedProvider(null);
                          }}
                          className={`flex items-center justify-between rounded px-2 py-1.5 text-sm transition-colors ${isInChain ? "bg-accent" : ""
                            } ${isInChain ? "cursor-grab active:cursor-grabbing" : ""} ${draggedProvider && isInChain && draggedProvider !== p.name ? "border border-dashed border-primary/40" : ""
                            }`}
                        >
                          <div className="flex items-center gap-2">
                            {isInChain && (
                              <GripVertical className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            )}
                            <input
                              type="checkbox"
                              checked={isInChain}
                              onChange={() => toggleFailoverProvider(p.name)}
                              className="rounded"
                            />
                            <ProviderIcon provider={p.name} active={isInChain} />
                            <span>{p.label}</span>
                            {p.name === "ollama" ? (
                              <OllamaStatusBadge connected={ollamaConnected} />
                            ) : (
                              <ConnectionBadge
                                hasApiKey={!!userApiKeys[p.name]}
                                hasOAuth={!!oauthStatus[p.name]?.connected}
                                tier={oauthStatus[p.name]?.tier || null}
                                authMode={getAuthMode(p.name)}
                              />
                            )}
                          </div>
                          {isInChain && (
                            <span className="text-xs text-muted-foreground">
                              #{displayNumber}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}
          </div>
        </section>

        <Separator className="my-6" />

        {/* Auto-Summary */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium">Auto-Summary</h2>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              Summary Depth:{" "}
              <span className="font-medium text-foreground">
                {settings.summarySentences <= 1
                  ? "One-liner"
                  : settings.summarySentences <= 2
                    ? "Brief (1-2 sentences)"
                    : settings.summarySentences <= 3
                      ? "Short paragraph (up to 3 sentences)"
                      : settings.summarySentences <= 5
                        ? "Thorough paragraph (3-5 sentences)"
                        : settings.summarySentences <= 7
                          ? "In-depth (1-2 paragraphs)"
                          : "Comprehensive analysis (2-3 paragraphs)"}
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
            <div className="mt-1 flex justify-between pr-[2px] text-[10px] text-muted-foreground">
              {Array.from({ length: 10 }, (_, i) => (
                <span key={i + 1} className={i === 0 ? "ml-[6px]" : ""}>{i + 1}</span>
              ))}
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
              const isPending = oauthPending[p.name] ?? false;
              const isExchanging = oauthExchanging[p.name] ?? false;

              // Auth mode options per provider
              const authModeOptions: { mode: AuthMode; label: string }[] =
                p.name === "anthropic"
                  ? [
                    { mode: "api_key", label: "API Key" },
                    { mode: "oauth", label: "OAuth" },
                  ]
                  : p.name === "openai"
                    ? [
                      { mode: "api_key", label: "API Key" },
                      { mode: "oauth_openai_codex", label: "Codex OAuth" },
                    ]
                    : [{ mode: "api_key", label: "API Key" }];

              // Determine the sign-in label based on provider
              const signInLabel =
                p.name === "gemini" ? "Sign in with Google" :
                  p.name === "anthropic" ? "Sign in with Anthropic" :
                    p.name === "openai" ? "Sign in with OpenAI" :
                      `Sign in with ${p.label}`;

              return (
                <div key={p.name} className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{p.label}</span>
                      <ConnectionBadge
                        hasApiKey={!!userApiKeys[p.name]}
                        hasOAuth={!!providerOAuth?.connected}
                        tier={providerOAuth?.tier || null}
                        authMode={authMode}
                      />
                    </div>
                    {/* Auth mode toggle */}
                    {authModeOptions.length > 1 && (
                      <div className="flex rounded-md border border-input text-xs">
                        {authModeOptions.map(({ mode, label }, idx) => (
                          <button
                            key={mode}
                            className={`${idx === 0 ? "rounded-l-md" : ""} ${idx === authModeOptions.length - 1 ? "rounded-r-md" : ""} px-2.5 py-1 transition-colors ${authMode === mode
                              ? "bg-primary text-primary-foreground"
                              : "hover:bg-accent"
                              }`}
                            onClick={async () => {
                              const key = `${p.name}AuthMode` as keyof Settings;
                              setSettings({ ...settings, [key]: mode });
                              await persistSettings({ [key]: mode });
                              // Reset pending state when switching modes
                              setOauthPending((prev) => ({ ...prev, [p.name]: false }));
                              setOauthCode("");

                              // Refetch models when switching Gemini auth modes
                              if (p.name === "gemini") {
                                modelsFetchedRef.current = false; // Allow refetch
                                setModelsLoading((prev) => ({ ...prev, gemini: true }));

                                // Fetch standard Gemini models
                                fetch("/api/models/gemini")
                                  .then((r) => r.json())
                                  .then((data) => {
                                    const raw = data.models || [];
                                    const models: string[] = raw.map((m: any) => (typeof m === "string" ? m : m.id));
                                    if (models.length > 0) {
                                      setDynamicModels((prev) => ({ ...prev, gemini: models }));
                                      // Auto-select first Gemini model if needed
                                      if (!models.includes(settings.activeModel)) {
                                        const newModel = models[0] || "gemini-2.5-flash";
                                        setSettings((prev) => prev ? { ...prev, activeModel: newModel } : prev);
                                        persistSettings({ activeModel: newModel });
                                      }
                                    }
                                  })
                                  .catch(() => { })
                                  .finally(() => setModelsLoading((prev) => ({ ...prev, gemini: false })));
                              }
                            }}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {authMode === "api_key" ? (
                    <div>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Input
                            type={showKeys[p.keyField] ? "text" : "password"}
                            value={apiKeys[p.keyField] ?? ""}
                            onChange={(e) =>
                              setApiKeys({ ...apiKeys, [p.keyField]: e.target.value })
                            }
                            placeholder={
                              userApiKeys[p.name]
                                ? "Key saved — enter a new key to replace"
                                : `Enter your ${p.label} API key...`
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
                        <Button
                          size="sm"
                          className="h-9 text-xs"
                          disabled={!apiKeys[p.keyField]?.trim()}
                          onClick={async () => {
                            // Save as per-user API key (not admin global key)
                            const ok = await persistSettings({ userApiKeys: { [p.name]: apiKeys[p.keyField] } });
                            if (ok) {
                              setApiKeys((prev) => ({ ...prev, [p.keyField]: "" }));
                              setUserApiKeys((prev) => ({ ...prev, [p.name]: "••••••••" }));
                            }
                          }}
                        >
                          Save
                        </Button>
                      </div>
                      {!(settings as any)[p.keyField] && !apiKeys[p.keyField] && ({
                        openai: { url: "https://platform.openai.com/api-keys", label: "platform.openai.com" },
                        anthropic: { url: "https://console.anthropic.com/settings/keys", label: "console.anthropic.com" },
                        gemini: { url: "https://aistudio.google.com/apikey", label: "aistudio.google.com" },
                      } as Record<string, { url: string; label: string }>)[p.name] && (
                          <div className="mt-1.5 text-xs text-muted-foreground">
                            Get your API key at{" "}
                            <a
                              href={({ openai: "https://platform.openai.com/api-keys", anthropic: "https://console.anthropic.com/settings/keys", gemini: "https://aistudio.google.com/apikey" } as Record<string, string>)[p.name]}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline hover:text-foreground"
                            >
                              {({ openai: "platform.openai.com", anthropic: "console.anthropic.com", gemini: "aistudio.google.com" } as Record<string, string>)[p.name]}
                            </a>
                          </div>
                        )}
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
                    /* Unified OAuth code-paste flow (all providers via pi-ai) */
                    <div className="space-y-2">
                      {!isPending ? (
                        <>
                          <div className="text-xs text-muted-foreground">
                            {p.name === "anthropic" && authMode === "oauth"
                              ? "Sign in with your Anthropic account (Claude Pro/Max)."
                              : authMode === "oauth_openai_codex"
                                ? "Sign in with your OpenAI account (ChatGPT Plus/Pro)."
                                : `Sign in with ${p.label}.`}
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs"
                            onClick={async () => {
                              setError(null);
                              try {
                                const res = await fetch(`/api/oauth/${p.name}/authorize?authMode=${authMode}`);
                                const data = await res.json();
                                if (data.error) throw new Error(data.error);
                                window.open(data.authUrl, "_blank", "noopener");
                                setOauthPending((prev) => ({ ...prev, [p.name]: true }));
                                setOauthSessionId((prev) => ({ ...prev, [p.name]: data.sessionId }));
                                if (data.instructions) {
                                  setOauthInstructions((prev) => ({ ...prev, [p.name]: data.instructions }));
                                }
                                setOauthCode("");
                              } catch (e: any) {
                                setError(e.message);
                              }
                            }}
                          >
                            <LogIn className="mr-1.5 h-3 w-3" />
                            {signInLabel}
                          </Button>
                        </>
                      ) : LOCAL_SERVER_AUTH_MODES.current.has(authMode) ? (
                        /* Local-server flow: auto-detect via polling, no code input needed */
                        <>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            <span>
                              {oauthProgress[p.name] ||
                                oauthInstructions[p.name] ||
                                "Complete the sign-in in your browser — connection will be detected automatically."}
                            </span>
                          </div>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                            onClick={() => {
                              setOauthPending((prev) => ({ ...prev, [p.name]: false }));
                              setOauthCode("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        /* Non-local-server flow: user must paste a code */
                        <>
                          <div className="text-xs text-muted-foreground">
                            {oauthInstructions[p.name] || (
                              <>
                                A new tab should have opened. After authorizing, copy the
                                authorization code (or the full redirect URL) and paste it below.
                              </>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              value={oauthCode}
                              onChange={(e) => setOauthCode(e.target.value)}
                              placeholder="Paste authorization code or URL..."
                              className="text-xs"
                              disabled={isExchanging}
                            />
                            <Button
                              size="sm"
                              className="h-9 text-xs"
                              disabled={!oauthCode.trim() || isExchanging}
                              onClick={async () => {
                                setError(null);
                                setOauthExchanging((prev) => ({ ...prev, [p.name]: true }));
                                try {
                                  const res = await fetch(`/api/oauth/${p.name}/exchange`, {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      code: oauthCode.trim(),
                                      sessionId: oauthSessionId[p.name],
                                      authMode,
                                    }),
                                  });
                                  const data = await res.json();
                                  if (data.error) throw new Error(data.error);
                                  setOauthPending((prev) => ({ ...prev, [p.name]: false }));
                                  setOauthCode("");
                                  setOauthMessage(`Successfully connected to ${p.label}`);
                                  setTimeout(() => setOauthMessage(null), 5000);
                                  // Refresh settings (server now auto-switches activeProvider)
                                  const settingsRes = await fetch("/api/settings");
                                  const settingsData = await settingsRes.json();
                                  if (settingsData.oauthStatus) setOauthStatus(settingsData.oauthStatus);
                                  setSettings(settingsData);
                                  // Notify TopBar of the provider switch
                                  if (settingsData.activeProvider) {
                                    window.dispatchEvent(
                                      new CustomEvent("provider-switched", {
                                        detail: { provider: settingsData.activeProvider, model: settingsData.activeModel },
                                      })
                                    );
                                  }
                                } catch (e: any) {
                                  setError(e.message);
                                } finally {
                                  setOauthExchanging((prev) => ({ ...prev, [p.name]: false }));
                                }
                              }}
                            >
                              {isExchanging ? "Connecting..." : "Submit"}
                            </Button>
                          </div>
                          <button
                            className="text-xs text-muted-foreground hover:text-foreground underline"
                            onClick={() => {
                              setOauthPending((prev) => ({ ...prev, [p.name]: false }));
                              setOauthCode("");
                            }}
                          >
                            Cancel
                          </button>
                        </>
                      )}

                      {/* Anthropic: also show setup-token option when in OAuth mode */}
                      {p.name === "anthropic" && authMode === "oauth" && !isPending && (
                        <div className="mt-3 border-t border-border pt-3">
                          <div className="text-xs text-muted-foreground mb-1.5">
                            Or paste a token from{" "}
                            <span className="font-mono font-medium">claude setup-token</span>{" "}
                            (Claude Code CLI):
                          </div>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                type={showKeys.anthropicSetupToken ? "text" : "password"}
                                value={anthropicSetupToken}
                                onChange={(e) => setAnthropicSetupToken(e.target.value)}
                                placeholder="sk-ant-oat01-..."
                                className="pr-10 text-xs"
                                disabled={anthropicSetupSaving}
                              />
                              <button
                                className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                                onClick={() =>
                                  setShowKeys({ ...showKeys, anthropicSetupToken: !showKeys.anthropicSetupToken })
                                }
                              >
                                {showKeys.anthropicSetupToken ? (
                                  <EyeOff className="h-3 w-3" />
                                ) : (
                                  <Eye className="h-3 w-3" />
                                )}
                              </button>
                            </div>
                            <Button
                              size="sm"
                              className="h-9 text-xs"
                              disabled={!anthropicSetupToken.trim() || anthropicSetupSaving}
                              onClick={async () => {
                                setError(null);
                                setAnthropicSetupSaving(true);
                                try {
                                  const res = await fetch("/api/oauth/anthropic/setup-token", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ token: anthropicSetupToken.trim() }),
                                  });
                                  const data = await res.json();
                                  if (data.error) throw new Error(data.error);
                                  setAnthropicSetupToken("");
                                  setOauthMessage("Anthropic setup token saved successfully");
                                  setTimeout(() => setOauthMessage(null), 5000);
                                  // Refresh settings (server now auto-switches activeProvider)
                                  const settingsRes = await fetch("/api/settings");
                                  const settingsData = await settingsRes.json();
                                  if (settingsData.oauthStatus) setOauthStatus(settingsData.oauthStatus);
                                  setSettings(settingsData);
                                  // Notify TopBar of the provider switch
                                  if (settingsData.activeProvider) {
                                    window.dispatchEvent(
                                      new CustomEvent("provider-switched", {
                                        detail: { provider: settingsData.activeProvider, model: settingsData.activeModel },
                                      })
                                    );
                                  }
                                } catch (e: any) {
                                  setError(e.message);
                                } finally {
                                  setAnthropicSetupSaving(false);
                                }
                              }}
                            >
                              {anthropicSetupSaving ? "Saving..." : "Save Token"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Ollama (local, permission-based detection) */}
            <div className="rounded-md border border-border p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                <span>Ollama (Local)</span>
                <OllamaStatusBadge connected={ollamaConnected} />
              </div>

              {!ollama.permitted ? (
                <div className="space-y-2">
                  <p className="text-xs text-muted-foreground">
                    Curiosity will check if Ollama is running on your machine (localhost:11434). This stays entirely on your device.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => ollama.allow()}
                    className="gap-1.5"
                  >
                    <Wifi className="h-3.5 w-3.5" />
                    Detect Local Ollama
                  </Button>
                </div>
              ) : ollama.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Checking for Ollama...
                </div>
              ) : ollama.isAvailable ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    {ollama.models.length} model{ollama.models.length !== 1 ? "s" : ""} available
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => ollama.revoke()}
                    className="gap-1.5 text-xs text-muted-foreground"
                  >
                    <WifiOff className="h-3.5 w-3.5" />
                    Disconnect
                  </Button>
                </div>
              ) : (
                <OllamaSetupGuide onRetry={() => ollama.recheck()} onDisconnect={() => ollama.revoke()} />
              )}
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
                onCheckedChange={(checked: boolean) => {
                  setSettings({ ...settings, memoryEnabled: checked });
                  persistSettings({ memoryEnabled: checked });
                }}
              />
            </div>

            {settings.memoryEnabled && (
              <>
                {/* Embedding Provider with Mode Toggle */}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="block text-xs text-muted-foreground">
                      Embedding Provider
                    </label>
                    {/* Embedding Mode Toggle Badge */}
                    <div className="flex rounded-md border border-input text-xs">
                      {([
                        { mode: "online" as EmbeddingMode, label: "Online" },
                        { mode: "local" as EmbeddingMode, label: "Local" },
                      ]).map(({ mode, label }, idx) => (
                        <button
                          key={mode}
                          className={`${idx === 0 ? "rounded-l-md" : ""} ${idx === 1 ? "rounded-r-md" : ""} px-2.5 py-1 transition-colors ${settings.embeddingMode === mode
                            ? "bg-primary text-primary-foreground"
                            : "hover:bg-accent"
                            }`}
                          onClick={() => {
                            if (mode === "local") {
                              // Force backend to ollama when switching to local
                              const defaultModel = ollamaEmbeddingModels[0] || settings.localEmbeddingModel || "nomic-embed-text";
                              setSettings({ ...settings, embeddingMode: mode, localEmbeddingBackend: "ollama", localEmbeddingModel: defaultModel });
                              persistSettings({ embeddingMode: mode, localEmbeddingBackend: "ollama", localEmbeddingModel: defaultModel });
                            } else {
                              setSettings({ ...settings, embeddingMode: mode });
                              persistSettings({ embeddingMode: mode });
                            }
                          }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Online Embedding Settings */}
                {settings.embeddingMode === "online" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <ProviderIcon provider={settings.embeddingProvider} active />
                          {({ openai: "OpenAI", gemini: "Gemini" } as Record<string, string>)[settings.embeddingProvider] || settings.embeddingProvider}
                        </span>
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                      {([["openai", "OpenAI"], ["gemini", "Gemini"]] as [LLMProviderName, string][]).map(([value, label]) => (
                        <DropdownMenuItem
                          key={value}
                          onSelect={() => {
                            setSettings({ ...settings, embeddingProvider: value, embeddingProviderOverride: true });
                            persistSettings({ embeddingProvider: value, embeddingProviderOverride: true });
                          }}
                          className="flex items-center gap-2"
                        >
                          <ProviderIcon provider={value} active={value === settings.embeddingProvider} />
                          {label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}

                {/* Local Embedding Settings (Ollama only) */}
                {settings.embeddingMode === "local" && (
                  <div className="space-y-3">
                    {/* Provider row: Ollama icon + name + connected badge */}
                    <div className="flex items-center gap-2">
                      <ProviderIcon provider="ollama" active={ollamaEmbeddingConnected === true} />
                      <span className="text-sm">Ollama (Local Server)</span>
                      <OllamaStatusBadge connected={ollamaEmbeddingConnected} />
                    </div>

                    {/* Embedding Model selector */}
                    <div>
                      <label className="mb-1 block text-xs text-muted-foreground">
                        Embedding Model
                      </label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm">
                            <span>
                              {(() => {
                                const staticModel = LOCAL_EMBEDDING_MODELS.ollama.find(m => m.id === settings.localEmbeddingModel);
                                return staticModel ? staticModel.name : settings.localEmbeddingModel;
                              })()}
                            </span>
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
                          {LOCAL_EMBEDDING_MODELS.ollama.map((model) => (
                            <DropdownMenuItem
                              key={model.id}
                              onSelect={() => {
                                setSettings({ ...settings, localEmbeddingBackend: "ollama", localEmbeddingModel: model.id });
                                persistSettings({ localEmbeddingBackend: "ollama", localEmbeddingModel: model.id });
                              }}
                            >
                              <div className="flex flex-col">
                                <span>{model.name}</span>
                                <span className="text-[10px] text-muted-foreground">{model.dimensions} dimensions</span>
                              </div>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {ollamaEmbeddingConnected === false && (
                        <div className="mt-1.5 text-[10px] text-muted-foreground">
                          Run <code className="rounded bg-muted px-1">ollama serve</code> and <code className="rounded bg-muted px-1">ollama pull {settings.localEmbeddingModel}</code>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label
                      className="mb-1 block text-xs text-muted-foreground cursor-help"
                      title="Controls how quickly memory relevance fades over time. Higher values cause memories to decay faster, while lower values keep memories relevant longer."
                    >
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
                      onBlur={() => persistSettings({ decayLambda: settings.decayLambda })}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs text-muted-foreground cursor-help"
                      title="How much semantic similarity influences memory retrieval scoring. Higher values prioritize memories whose content closely matches the current query."
                    >
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
                      onBlur={() => persistSettings({ similarityWeight: settings.similarityWeight })}
                    />
                  </div>
                  <div>
                    <label
                      className="mb-1 block text-xs text-muted-foreground cursor-help"
                      title="How much recency influences memory retrieval scoring. Higher values favor recently created or accessed memories over older ones."
                    >
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
                      onBlur={() => persistSettings({ temporalWeight: settings.temporalWeight })}
                    />
                  </div>
                </div>
              </>
            )}
          </div>
        </section>

        {authInfo?.isAdmin && (
          <>
            <Separator className="my-6" />

            {/* Developer Section */}
            <section className="mb-6">
              <h2 className="mb-3 text-sm font-medium text-primary">Developer</h2>
              <div className="rounded-md border border-primary/30 p-4 space-y-4">
                <div>
                  <div className="text-sm font-medium mb-1">Anthropic API Key</div>
                  <div className="text-xs text-muted-foreground mb-2">
                    This key is used for all users on the platform.
                  </div>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showAdminApiKey ? "text" : "password"}
                        value={adminApiKey}
                        onChange={(e) => setAdminApiKey(e.target.value)}
                        placeholder="sk-ant-..."
                      />
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => setShowAdminApiKey(!showAdminApiKey)}
                      >
                        {showAdminApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={async () => {
                        try {
                          const res = await fetch("/api/settings", {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ anthropicApiKey: adminApiKey }),
                          });
                          if (!res.ok) throw new Error("Failed to save");
                          setAdminApiKeySaved(true);
                          setTimeout(() => setAdminApiKeySaved(false), 2000);
                        } catch (e: any) {
                          setError(e.message);
                        }
                      }}
                    >
                      {adminApiKeySaved ? <Check className="h-4 w-4" /> : "Save"}
                    </Button>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}

        <Separator className="my-6" />

        {/* Danger Zone */}
        <section className="mb-6">
          <h2 className="mb-3 text-sm font-medium text-destructive">Danger Zone</h2>
          <div className="space-y-3 rounded-md border border-destructive/30 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Clear Credentials</div>
                <div className="text-xs text-muted-foreground">
                  Remove all API keys, OAuth tokens, and setup tokens.
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm("Are you sure you want to remove ALL saved API keys, OAuth tokens, and setup tokens? You will need to re-enter them to use any provider.")) return;
                  try {
                    const res = await fetch("/api/settings", { method: "DELETE" });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error || "Failed to clear credentials");
                    if (data.oauthStatus) setOauthStatus(data.oauthStatus);
                    setSettings(data);
                    setApiKeys({});
                    setAnthropicSetupToken("");
                    setOauthMessage("All credentials cleared");
                    setTimeout(() => setOauthMessage(null), 5000);
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Clear Memories</div>
                <div className="text-xs text-muted-foreground">
                  Permanently delete all stored memories. This cannot be undone.
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={async () => {
                  if (!confirm("Are you sure you want to delete ALL memories? This cannot be undone.")) return;
                  try {
                    const res = await fetch("/api/memory", {
                      method: "DELETE",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ all: true }),
                    });
                    if (!res.ok) throw new Error("Failed to clear memories");
                    setSaved(true);
                    setTimeout(() => setSaved(false), 2000);
                  } catch (e: any) {
                    setError(e.message);
                  }
                }}
              >
                <Brain className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">Clear Chats</div>
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
                <MessageSquare className="mr-2 h-4 w-4" />
                Clear All
              </Button>
            </div>
          </div>
        </section>

        <div className="pb-6" />
      </div>

      {/* Floating save toast */}
      <div
        className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-md border bg-popover px-3 py-2 text-sm shadow-lg transition-all duration-300 ${saved ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0 pointer-events-none"
          }`}
      >
        <Check className="h-4 w-4 text-green-500" />
        Settings saved
      </div>
    </div>
  );
}
