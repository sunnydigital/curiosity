import { GoogleGenerativeAI } from "@google/generative-ai";
import { BaseLLMProvider } from "./types";
import type {
  LLMCompletionRequest,
  LLMCompletionResponse,
  LLMStreamChunk,
  EmbeddingRequest,
  EmbeddingResponse,
} from "@/types";

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export class GeminiProvider extends BaseLLMProvider {
  name = "gemini" as const;
  private client: GoogleGenerativeAI | null;
  private apiKey: string;
  private accessToken: string | null;

  constructor(credential: string, useBearer = false) {
    super();
    if (useBearer) {
      this.apiKey = "";
      this.accessToken = credential;
      this.client = null; // SDK doesn't support Bearer; use REST
    } else {
      this.apiKey = credential;
      this.accessToken = null;
      this.client = new GoogleGenerativeAI(credential);
    }
  }

  private buildParts(m: { content: string; image?: { base64: string; mimeType: string } }) {
    const parts: any[] = [];
    if (m.image) {
      parts.push({ inlineData: { mimeType: m.image.mimeType, data: m.image.base64 } });
    }
    parts.push({ text: m.content });
    return parts;
  }

  private buildSystemInstruction(messages: LLMCompletionRequest["messages"]): string | undefined {
    const systemMessages = messages.filter((m) => m.role === "system");
    if (systemMessages.length === 0) return undefined;
    return systemMessages.map((m) => m.content).join("\n\n");
  }

  /**
   * Merge consecutive messages with the same role, as Gemini requires
   * strictly alternating user/model roles in chat history.
   */
  private mergeConsecutiveRoles(
    messages: { role: string; parts: any[] }[]
  ): { role: string; parts: any[] }[] {
    if (messages.length === 0) return [];
    const merged: { role: string; parts: any[] }[] = [{ ...messages[0] }];
    for (let i = 1; i < messages.length; i++) {
      const prev = merged[merged.length - 1];
      if (messages[i].role === prev.role) {
        prev.parts = [...prev.parts, ...messages[i].parts];
      } else {
        merged.push({ ...messages[i] });
      }
    }
    return merged;
  }

  // ── REST API helpers for OAuth Bearer auth ──

  private authHeaders(): Record<string, string> {
    if (this.accessToken) {
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
      };
    }
    return { "Content-Type": "application/json" };
  }

  private modelUrl(model: string, method: string): string {
    if (this.accessToken) {
      return `${GEMINI_API_BASE}/models/${model}:${method}`;
    }
    return `${GEMINI_API_BASE}/models/${model}:${method}?key=${this.apiKey}`;
  }

  private buildRestBody(req: LLMCompletionRequest) {
    const systemInstruction = this.buildSystemInstruction(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const contents = this.mergeConsecutiveRoles(
      nonSystemMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: this.buildParts(m),
      }))
    );

    return {
      contents,
      ...(systemInstruction
        ? { systemInstruction: { parts: [{ text: systemInstruction }] } }
        : {}),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      },
    };
  }

  // ── Public API ──

  async complete(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    if (this.accessToken) {
      return this.completeRest(req);
    }
    return this.completeSdk(req);
  }

  async *stream(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    if (this.accessToken) {
      yield* this.streamRest(req);
    } else {
      yield* this.streamSdk(req);
    }
  }

  // ── SDK-based methods (API key auth) ──

  private async completeSdk(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const model = this.client!.getGenerativeModel({ model: req.model });
    const systemInstruction = this.buildSystemInstruction(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const rawHistory = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: this.buildParts(m),
    }));
    const history = this.mergeConsecutiveRoles(rawHistory);

    const chat = model.startChat({
      history,
      ...(systemInstruction ? { systemInstruction } : {}),
    });

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
    const result = await chat.sendMessage(this.buildParts(lastMessage));
    const text = result.response.text();

    return {
      content: text,
      model: req.model,
      provider: "gemini",
    };
  }

  private async *streamSdk(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const model = this.client!.getGenerativeModel({ model: req.model });
    const systemInstruction = this.buildSystemInstruction(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const rawHistory = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: this.buildParts(m),
    }));
    const history = this.mergeConsecutiveRoles(rawHistory);

    const chat = model.startChat({
      history,
      ...(systemInstruction ? { systemInstruction } : {}),
    });

    const lastMessage = nonSystemMessages[nonSystemMessages.length - 1];
    const result = await chat.sendMessageStream(this.buildParts(lastMessage));

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) {
        yield { content: text, done: false };
      }
    }
    yield { content: "", done: true };
  }

  // ── REST-based methods (OAuth Bearer auth) ──

  private async completeRest(req: LLMCompletionRequest): Promise<LLMCompletionResponse> {
    const url = this.modelUrl(req.model, "generateContent");
    const body = this.buildRestBody(req);

    const response = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

    return {
      content: text,
      model: req.model,
      provider: "gemini",
    };
  }

  private async *streamRest(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const url = this.modelUrl(req.model, "streamGenerateContent") + (this.accessToken ? "?alt=sse" : "&alt=sse");
    const body = this.buildRestBody(req);

    const response = await fetch(url, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Gemini API error (${response.status}): ${err}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { content: "", done: true };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;
          try {
            const data = JSON.parse(jsonStr);
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
            if (text) {
              yield { content: text, done: false };
            }
          } catch {
            // Skip malformed SSE lines
          }
        }
      }
    }

    yield { content: "", done: true };
  }

  async embed(req: EmbeddingRequest): Promise<EmbeddingResponse> {
    if (this.accessToken) {
      const model = req.model || "text-embedding-004";
      const url = this.modelUrl(model, "embedContent");
      const response = await fetch(url, {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({ content: { parts: [{ text: req.text }] } }),
      });
      if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini embedding error (${response.status}): ${err}`);
      }
      const data = await response.json();
      const embedding = data.embedding.values;
      return { embedding, dimensions: embedding.length };
    }

    const model = this.client!.getGenerativeModel({
      model: req.model || "text-embedding-004",
    });
    const result = await model.embedContent(req.text);
    return {
      embedding: result.embedding.values,
      dimensions: result.embedding.values.length,
    };
  }

}
