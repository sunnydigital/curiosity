import crypto from "crypto";
import fs from "fs";
import path from "path";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

const KEY_FILE = path.join(process.cwd(), ".curiosity-key");

let cachedKey: Buffer | null = null;

/**
 * Resolve the encryption key. Priority:
 * 1. CURIOSITY_ENCRYPTION_KEY env var (if set)
 * 2. Auto-generated key persisted in .curiosity-key file
 */
function getEncryptionKey(): Buffer {
  if (cachedKey) return cachedKey;

  let raw = process.env.CURIOSITY_ENCRYPTION_KEY;

  if (!raw) {
    // Try to read a previously-generated key from disk
    if (fs.existsSync(KEY_FILE)) {
      raw = fs.readFileSync(KEY_FILE, "utf-8").trim();
    }

    // If still nothing, generate a new key and persist it
    if (!raw) {
      raw = crypto.randomBytes(32).toString("hex");
      fs.writeFileSync(KEY_FILE, raw, { mode: 0o600 });
      console.log("[Crypto] Auto-generated encryption key → .curiosity-key");
    }
  }

  cachedKey = crypto.scryptSync(raw, "curiosity-salt", 32);
  return cachedKey;
}

export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const tag = cipher.getAuthTag();
  return iv.toString("hex") + ":" + tag.toString("hex") + ":" + encrypted;
}

export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted text format");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}
