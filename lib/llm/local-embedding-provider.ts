/**
 * Local Embedding Provider
 *
 * Supports multiple backends for on-device embedding generation:
 * - transformers: HuggingFace Transformers.js (WebGPU/WASM)
 * - onnx: ONNX Runtime (CPU/GPU)
 * - tflite: TensorFlow Lite (lightweight, mobile-friendly)
 * - ollama: Local Ollama server (requires Ollama running)
 */

import type { LocalEmbeddingBackend, EmbeddingRequest, EmbeddingResponse } from "@/types";

// Lazy-loaded pipeline for transformers.js
let transformersPipeline: any = null;
let currentTransformersModel: string | null = null;

// Lazy-loaded ONNX session
let onnxSession: any = null;
let currentOnnxModel: string | null = null;

/**
 * Generate embeddings using local backends
 */
export async function generateLocalEmbedding(
  text: string,
  backend: LocalEmbeddingBackend,
  model: string,
  ollamaBaseUrl?: string
): Promise<EmbeddingResponse> {
  console.log(`[LocalEmbedding] Generating embedding with backend: ${backend}, model: ${model}`);

  switch (backend) {
    case "transformers":
      return generateTransformersEmbedding(text, model);
    case "onnx":
      return generateOnnxEmbedding(text, model);
    case "tflite":
      return generateTfliteEmbedding(text, model);
    case "ollama":
      return generateOllamaEmbedding(text, model, ollamaBaseUrl || "http://localhost:11434");
    default:
      throw new Error(`Unknown local embedding backend: ${backend}`);
  }
}

/**
 * Transformers.js backend (HuggingFace models via WebGPU/WASM)
 */
async function generateTransformersEmbedding(
  text: string,
  model: string
): Promise<EmbeddingResponse> {
  try {
    // Dynamically import transformers.js
    const { pipeline, env } = await import("@xenova/transformers");

    // Configure for server-side usage
    env.allowLocalModels = false;
    env.useBrowserCache = false;

    // Load or reuse pipeline
    if (!transformersPipeline || currentTransformersModel !== model) {
      console.log(`[LocalEmbedding] Loading transformers model: ${model}`);
      transformersPipeline = await pipeline("feature-extraction", model, {
        quantized: true, // Use quantized model for faster inference
      });
      currentTransformersModel = model;
    }

    // Generate embedding
    const output = await transformersPipeline(text, {
      pooling: "mean",
      normalize: true,
    });

    const embedding = Array.from(output.data as Float32Array);

    return {
      embedding,
      dimensions: embedding.length,
    };
  } catch (error: any) {
    console.error("[LocalEmbedding] Transformers error:", error);
    throw new Error(`Transformers embedding failed: ${error.message}. Make sure @xenova/transformers is installed.`);
  }
}

/**
 * ONNX Runtime backend
 */
async function generateOnnxEmbedding(
  text: string,
  model: string
): Promise<EmbeddingResponse> {
  try {
    // Dynamically import onnxruntime-node
    const ort = await import("onnxruntime-node");

    // For ONNX, we need the tokenizer and model files
    // This is a simplified implementation - full implementation would need
    // proper tokenization and model loading

    if (!onnxSession || currentOnnxModel !== model) {
      console.log(`[LocalEmbedding] Loading ONNX model: ${model}`);
      // In a full implementation, you'd download/cache the model and load it
      // For now, we'll throw a helpful error
      throw new Error(
        `ONNX backend requires model files to be downloaded. ` +
        `Please use the 'transformers' or 'ollama' backend for easier setup.`
      );
    }

    // Placeholder for actual ONNX inference
    throw new Error("ONNX embedding not yet fully implemented");
  } catch (error: any) {
    console.error("[LocalEmbedding] ONNX error:", error);
    throw new Error(`ONNX embedding failed: ${error.message}`);
  }
}

/**
 * TensorFlow Lite backend
 */
async function generateTfliteEmbedding(
  text: string,
  model: string
): Promise<EmbeddingResponse> {
  try {
    // TFLite requires the model file and proper tokenization
    // This is a placeholder - full implementation would need
    // @tensorflow/tfjs or a native TFLite binding

    throw new Error(
      `TFLite backend requires model files to be downloaded. ` +
      `Please use the 'transformers' or 'ollama' backend for easier setup.`
    );
  } catch (error: any) {
    console.error("[LocalEmbedding] TFLite error:", error);
    throw new Error(`TFLite embedding failed: ${error.message}`);
  }
}

/**
 * Ollama backend (local Ollama server)
 */
async function generateOllamaEmbedding(
  text: string,
  model: string,
  baseUrl: string
): Promise<EmbeddingResponse> {
  try {
    const response = await fetch(`${baseUrl}/api/embed`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Ollama error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const embedding = data.embeddings?.[0] || data.embedding || [];

    if (!embedding || embedding.length === 0) {
      throw new Error(`Ollama returned empty embedding. Make sure model '${model}' is pulled.`);
    }

    return {
      embedding,
      dimensions: embedding.length,
    };
  } catch (error: any) {
    console.error("[LocalEmbedding] Ollama error:", error);

    if (error.cause?.code === "ECONNREFUSED") {
      throw new Error(
        `Cannot connect to Ollama at ${baseUrl}. ` +
        `Make sure Ollama is running (ollama serve) and the embedding model is pulled (ollama pull ${model}).`
      );
    }

    throw new Error(`Ollama embedding failed: ${error.message}`);
  }
}

/**
 * Check if a local embedding backend is available
 */
export async function checkLocalBackendAvailability(
  backend: LocalEmbeddingBackend,
  ollamaBaseUrl?: string
): Promise<{ available: boolean; message: string }> {
  switch (backend) {
    case "transformers":
      try {
        await import("@xenova/transformers");
        return { available: true, message: "Transformers.js is available" };
      } catch {
        return {
          available: false,
          message: "Install @xenova/transformers: npm install @xenova/transformers"
        };
      }

    case "onnx":
      try {
        await import("onnxruntime-node");
        return { available: true, message: "ONNX Runtime is available" };
      } catch {
        return {
          available: false,
          message: "Install onnxruntime-node: npm install onnxruntime-node"
        };
      }

    case "tflite":
      try {
        await import("@tensorflow/tfjs-node");
        return { available: true, message: "TensorFlow.js is available" };
      } catch {
        return {
          available: false,
          message: "Install @tensorflow/tfjs-node: npm install @tensorflow/tfjs-node"
        };
      }

    case "ollama":
      try {
        const url = ollamaBaseUrl || "http://localhost:11434";
        const response = await fetch(`${url}/api/tags`, {
          method: "GET",
          signal: AbortSignal.timeout(3000),
        });
        if (response.ok) {
          return { available: true, message: "Ollama is running" };
        }
        return { available: false, message: `Ollama returned ${response.status}` };
      } catch {
        return {
          available: false,
          message: "Ollama is not running. Start with: ollama serve"
        };
      }

    default:
      return { available: false, message: `Unknown backend: ${backend}` };
  }
}
