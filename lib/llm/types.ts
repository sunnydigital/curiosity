import type {
  LLMProviderName,
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

export abstract class BaseLLMProvider {
  abstract name: LLMProviderName;
  abstract complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse>;
  abstract stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown>;
  abstract embed(req: EmbeddingRequest): Promise<EmbeddingResponse>;
  abstract listModels(): Promise<string[]>;
}
