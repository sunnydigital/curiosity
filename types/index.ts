export type LLMProviderName = "openai" | "anthropic" | "gemini" | "ollama";

export interface Chat {
  id: string;
  title: string;
  starred: boolean;
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
  decayLambda: number;
  similarityWeight: number;
  temporalWeight: number;
  previewProvider: LLMProviderName;
  previewModel: string;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
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
