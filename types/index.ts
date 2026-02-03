export type LLMProviderName = "openai" | "anthropic" | "gemini" | "ollama";

export type AuthMode =
  | "api_key"
  | "oauth"                // Anthropic OAuth / generic
  | "oauth_gemini_cli"     // Google Gemini CLI credentials
  | "oauth_antigravity"    // Google Cloud Code Assist (Antigravity)
  | "oauth_openai_codex"   // OpenAI Codex (ChatGPT Plus/Pro)
  | "oauth_github_copilot"; // GitHub Copilot

/** Credential format used by @mariozechner/pi-ai OAuth providers. */
export interface PiOAuthCredentials {
  access: string;
  refresh: string;
  expires: number; // epoch ms
  /** Extra fields some providers add (e.g. accountId, projectId) */
  [key: string]: any;
}

export type SubscriptionTier =
  | "free"
  | "plus"
  | "pro"
  | "max"
  | "enterprise"
  | "unknown";

export interface OAuthTokens {
  provider: LLMProviderName;
  accessToken: string;
  refreshToken: string | null;
  tokenType: string;
  expiresAt: string | null;
  scope: string | null;
  subscriptionTier: SubscriptionTier;
  subscriptionMetadata: Record<string, any> | null;
}

export interface ProviderError {
  provider: LLMProviderName;
  statusCode?: number;
  errorType: "rate_limit" | "auth" | "server" | "timeout" | "unknown";
  message: string;
  retryable: boolean;
}

export interface FailoverEvent {
  type: "failover";
  fromProvider: LLMProviderName;
  toProvider: LLMProviderName;
  reason: string;
}

export interface Chat {
  id: string;
  title: string;
  starred: boolean;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  title: string;
  icon: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Message {
  id: string;
  chatId: string;
  parentId: string | null;
  role: "user" | "assistant" | "system";
  content: string;
  isBranchRoot: boolean;
  branchPrompt: string | null;
  branchContext: string | null;
  branchSourceMessageId: string | null;
  branchCharStart: number | null;
  branchCharEnd: number | null;
  previewSummary: string | null;
  siblingIndex: number;
  provider: string | null;
  model: string | null;
  createdAt: string;
  children?: Message[];
}

export interface MessageTree {
  root: Message;
  nodes: Map<string, Message>;
}

export interface BranchCreationRequest {
  chatId: string;
  sourceMessageId: string;
  selectedText: string | null;
  charStart: number | null;
  charEnd: number | null;
  branchType: "learn_more" | "dont_understand" | "specifics" | "custom";
  customPrompt?: string;
}

export interface BranchPreviewRequest {
  chatId: string;
  sourceMessageId: string;
  selectedText: string;
}

export interface Memory {
  id: string;
  content: string;
  sourceChatId: string | null;
  sourceMessageId: string | null;
  embedding: Float32Array;
  createdAt: string;
  lastAccessedAt: string;
  accessCount: number;
  strength: number;
  similarityScore?: number;
  temporalScore?: number;
  combinedScore?: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  entryCount?: number;
}

export interface KnowledgeBaseEntry {
  id: string;
  knowledgeBaseId: string;
  memoryId: string | null;
  content: string;
  embedding: Float32Array;
  createdAt: string;
}

export interface Settings {
  activeProvider: LLMProviderName;
  activeModel: string;
  openaiApiKey: string | null;
  anthropicApiKey: string | null;
  geminiApiKey: string | null;
  ollamaBaseUrl: string;
  memoryEnabled: boolean;
  embeddingProvider: LLMProviderName;
  embeddingModel: string;
  embeddingProviderOverride: boolean;
  decayLambda: number;
  similarityWeight: number;
  temporalWeight: number;
  previewProvider: LLMProviderName;
  previewModel: string;
  previewProviderOverride: boolean;
  summarySentences: number;
  // Auth mode per provider
  openaiAuthMode: AuthMode;
  anthropicAuthMode: AuthMode;
  geminiAuthMode: AuthMode;
  // OAuth client credentials (per provider)
  openaiOauthClientId: string | null;
  openaiOauthClientSecret: string | null;
  anthropicOauthClientId: string | null;
  anthropicOauthClientSecret: string | null;
  geminiOauthClientId: string | null;
  geminiOauthClientSecret: string | null;
  // Default models per provider (used by TopBar provider switcher)
  defaultOpenaiModel: string;
  defaultAnthropicModel: string;
  defaultGeminiModel: string;
  defaultOllamaModel: string;
  // Preview models per provider (used for chat previews and summaries)
  previewOpenaiModel: string;
  previewAnthropicModel: string;
  previewGeminiModel: string;
  previewOllamaModel: string;
  // Failover
  failoverEnabled: boolean;
  failoverChain: LLMProviderName[];
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
  image?: { base64: string; mimeType: string };
}

export interface LLMCompletionRequest {
  model: string;
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface LLMCompletionResponse {
  content: string;
  model: string;
  provider: LLMProviderName;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface LLMStreamChunk {
  content: string;
  done: boolean;
}

export interface EmbeddingRequest {
  text: string;
  model?: string;
}

export interface EmbeddingResponse {
  embedding: number[];
  dimensions: number;
}
