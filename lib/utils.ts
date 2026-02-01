import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function embeddingToBuffer(embedding: number[]): Buffer {
  const float32 = new Float32Array(embedding);
  return Buffer.from(float32.buffer);
}

export function bufferToEmbedding(buffer: Buffer): number[] {
  const float32 = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  );
  return Array.from(float32);
}
