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
// Cloud Code Assist endpoints for oauth_antigravity mode
// Pi-ai uses production endpoint first, then falls back to sandbox
const CLOUD_CODE_ASSIST_ENDPOINTS = [
  "https://cloudcode-pa.googleapis.com",
  "https://daily-cloudcode-pa.sandbox.googleapis.com",
];

export class GeminiProvider extends BaseLLMProvider {
  name = "gemini" as const;
  private client: GoogleGenerativeAI | null;
  private apiKey: string;
  private accessToken: string | null;
  private projectId: string | null;
  private isAntigravity: boolean;

  constructor(credential: string, useBearer = false) {
    super();
    if (useBearer) {
      this.apiKey = "";
      // pi-ai's getApiKey() may return a JSON string like {"token":"...","projectId":"..."}
      // Extract both the access token and projectId for OAuth Bearer auth
      let token = credential;
      let project: string | null = null;
      try {
        const parsed = JSON.parse(credential);
        if (parsed.token) token = parsed.token;
        if (parsed.projectId) project = parsed.projectId;
      } catch {
        // Not JSON — use credential as-is (plain access token, no projectId)
      }
      this.accessToken = token;
      this.projectId = project;
      // Detect Antigravity mode by checking if projectId matches openclaw's default
      this.isAntigravity = project === "rising-fact-p41fc" || project?.includes("antigravity");
      this.client = null; // SDK doesn't support Bearer; use REST

      console.log(`[GeminiProvider] OAuth mode initialized:`, {
        hasToken: !!token,
        projectId: project,
        isAntigravity: this.isAntigravity
      });
    } else {
      this.apiKey = credential;
      this.accessToken = null;
      this.projectId = null;
      this.isAntigravity = false;
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

  /** Wrap a system instruction string into the Content format required by both the SDK and REST API. */
  private buildSystemInstructionContent(messages: LLMCompletionRequest["messages"]): { role: string; parts: { text: string }[] } | undefined {
    const text = this.buildSystemInstruction(messages);
    if (!text) return undefined;
    return { role: "user", parts: [{ text }] };
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
      // Based on openclaw's Google Antigravity implementation:
      // Use X-Goog-Api-Client header to identify as VS Code Cloud Shell Editor
      return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.accessToken}`,
        "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
        "User-Agent": "google-api-nodejs-client/9.15.1",
      };
    }
    return { "Content-Type": "application/json" };
  }

  private modelUrl(model: string, method: string): string | string[] {
    if (this.accessToken) {
      console.log(`[GeminiProvider] modelUrl called with OAuth token:`, {
        model,
        method,
        projectId: this.projectId,
        isAntigravity: this.isAntigravity
      });

      // Check if this is Antigravity mode (non-Google models via Google Cloud)
      if (this.isAntigravity) {
        // Antigravity provides access to Claude, Gemini-3, and GPT models via Cloud Code Assist
        // Block standard Gemini models (gemini-1.x, gemini-2.x) which only work with API keys
        const isStandardGeminiModel = /^gemini-[12]\./.test(model);
        if (isStandardGeminiModel) {
          throw new Error(
            `Google Antigravity OAuth provides access to Gemini-3, Claude, and GPT models via Google Cloud Code Assist.\n` +
            `You're trying to use model "${model}" which is a standard Gemini model that only works with API keys.\n\n` +
            `Solutions:\n` +
            `1. Switch to API key mode for standard Gemini models (gemini-1.x, gemini-2.x)\n` +
            `2. Or use an Antigravity model like "claude-opus-4-5-thinking", "gemini-3-pro-high", or "gpt-oss-120b-medium"\n\n` +
            `Note: The public Gemini API (generativelanguage.googleapis.com) only supports API keys.\n` +
            `      Antigravity OAuth provides access to models via Google Cloud Code Assist.`
          );
        }

        // Antigravity uses Google's internal streaming endpoint format (same as pi-ai library)
        // URL format from pi-ai: {baseUrl}/v1internal:streamGenerateContent?alt=sse
        // The model is passed in the request body, not the URL
        // Return array of endpoints to try (production first, then sandbox)
        if (method === "streamGenerateContent") {
          return CLOUD_CODE_ASSIST_ENDPOINTS.map(base => `${base}/v1internal:streamGenerateContent?alt=sse`);
        }

        // For non-streaming methods, use v1internal:generateContent
        return CLOUD_CODE_ASSIST_ENDPOINTS.map(base => `${base}/v1internal:generateContent`);
      }

      // IMPORTANT: The public Gemini API does NOT support OAuth Bearer tokens!
      // OAuth with cloud-platform scope only works with Vertex AI/Google Cloud endpoints.
      // This error will occur if you're using oauth_gemini_cli without a proper Google Cloud project.
      throw new Error(
        `The public Gemini API (generativelanguage.googleapis.com) does NOT support OAuth authentication.\n\n` +
        `The error "insufficient authentication scopes" means the OAuth token is not valid for this endpoint.\n\n` +
        `Solutions:\n` +
        `1. Use an API key instead (recommended): Get one from https://aistudio.google.com/apikey\n` +
        `   - Go to Settings → Change Gemini Auth Mode to "API Key"\n` +
        `   - Enter your API key from AI Studio\n\n` +
        `2. Use Vertex AI (enterprise): If you have a Google Cloud project with Vertex AI enabled\n` +
        `   - Set GOOGLE_CLOUD_PROJECT environment variable to your project ID\n` +
        `   - This requires a billing-enabled Google Cloud project\n\n` +
        `Note: oauth_gemini_cli was designed for Vertex AI, not the free public Gemini API.\n` +
        `The public API only supports API key authentication.`
      );
    }

    // API key mode: Use public API with key parameter
    return `${GEMINI_API_BASE}/models/${model}:${method}?key=${this.apiKey}`;
  }

  private buildRestBody(req: LLMCompletionRequest) {
    const systemInstructionContent = this.buildSystemInstructionContent(req.messages);
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const contents = this.mergeConsecutiveRoles(
      nonSystemMessages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: this.buildParts(m),
      }))
    );

    const requestBody: any = {
      contents,
      ...(systemInstructionContent
        ? { system_instruction: systemInstructionContent }
        : {}),
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
      },
    };

    // For Antigravity mode, wrap in the v1internal format
    if (this.isAntigravity) {
      // Use the discovered project, or fall back to OpenClaw's shared project
      const projectId = this.projectId || "rising-fact-p41fc";
      return {
        project: projectId,
        model: req.model,
        request: requestBody,
      };
    }

    return requestBody;
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
    const systemInstructionContent = this.buildSystemInstructionContent(req.messages);
    const model = this.client!.getGenerativeModel({
      model: req.model,
      ...(systemInstructionContent ? { systemInstruction: systemInstructionContent } : {}),
    });
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const rawHistory = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: this.buildParts(m),
    }));
    const history = this.mergeConsecutiveRoles(rawHistory);

    const chat = model.startChat({ history });

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
    const systemInstructionContent = this.buildSystemInstructionContent(req.messages);
    const model = this.client!.getGenerativeModel({
      model: req.model,
      ...(systemInstructionContent ? { systemInstruction: systemInstructionContent } : {}),
    });
    const nonSystemMessages = req.messages.filter((m) => m.role !== "system");

    const rawHistory = nonSystemMessages.slice(0, -1).map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: this.buildParts(m),
    }));
    const history = this.mergeConsecutiveRoles(rawHistory);

    const chat = model.startChat({ history });

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
    const urls = this.modelUrl(req.model, "generateContent");
    const urlsToTry = Array.isArray(urls) ? urls : [urls];
    const body = this.buildRestBody(req);

    let lastError: Error | null = null;

    // Try each endpoint in order
    for (const url of urlsToTry) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const err = await response.text();
          lastError = new Error(`Gemini API error (${response.status}): ${err}`);
          continue;
        }

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        return {
          content: text,
          model: req.model,
          provider: "gemini",
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    // All endpoints failed
    throw lastError || new Error("All Gemini endpoints failed");
  }

  private async *streamRest(
    req: LLMCompletionRequest
  ): AsyncGenerator<LLMStreamChunk, void, unknown> {
    const urls = this.modelUrl(req.model, "streamGenerateContent");
    const urlsToTry = Array.isArray(urls) ? urls : [urls];
    const body = this.buildRestBody(req);

    console.log(`[GeminiProvider] Streaming endpoints:`, urlsToTry);
    console.log(`[GeminiProvider] Request body:`, JSON.stringify(body, null, 2));

    let lastError: Error | null = null;

    // Try each endpoint in order
    for (const url of urlsToTry) {
      try {
        console.log(`[GeminiProvider] Trying endpoint:`, url);
        const response = await fetch(url, {
          method: "POST",
          headers: this.authHeaders(),
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const err = await response.text();
          console.log(`[GeminiProvider] Endpoint ${url} failed with ${response.status}:`, err);

          // Store error and try next endpoint
          lastError = new Error(`Gemini API error (${response.status}): ${err}`);
          continue;
        }

        // Success! Process the stream
        console.log(`[GeminiProvider] Successfully connected to:`, url);
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
        return; // Success, exit the function
      } catch (err) {
        console.log(`[GeminiProvider] Exception with endpoint ${url}:`, err);
        lastError = err instanceof Error ? err : new Error(String(err));
        continue;
      }
    }

    // All endpoints failed
    throw lastError || new Error("All Gemini endpoints failed");
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
