import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseLLMProvider } from "./types";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

export class GeminiProvider extends BaseLLMProvider {
  name = "gemini" as const;
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    super();
    this.client = new GoogleGenerativeAI(apiKey);
  }

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const model = this.client.getGenerativeModel({ model: req.model });
    const systemMessage = req.messages.find((m) => m.role === "system");
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage
        ? { role: "user", parts: [{ text: systemMessage.content }] }
        : undefined,
    });

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const text = result.response.text();

    return {
      content: text,
      model: req.model,
      provider: "gemini",
    };
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = this.client.getGenerativeModel({ model: req.model });
    const systemMessage = req.messages.find((m) => m.role === "system");
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const history = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const chat = model.startChat({
      history,
      systemInstruction: systemMessage
        ? { role: "user", parts: [{ text: systemMessage.content }] }
        : undefined,
    });

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
    const result = await chat.sendMessageStream(lastMessage.content);

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { content: text, done: false };
      }
    }
    yield { content: "", done: true };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = this.client.getGenerativeModel({
      model: req.model || "text-embedding-004",
    });
    const result = await model.embedContent(req.text);
    return {
      embedding: result.embedding.values,
      dimensions: result.embedding.values.length,
    };
  }

  async listModels(): Promise<string[]> {
    return [
      "gemini-2.0-flash",
      "gemini-2.0-flash-lite",
      "gemini-1.5-pro",
      "gemini-1.5-flash",
    ];
  }
}
