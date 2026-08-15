import crypto from "node:crypto";

/**
 * AES-256-GCM helpers for encrypting GDMS branch passwords at rest.
 * Key is lazily read from GDMS_CREDENTIALS_ENC_KEY so the build doesn't fail
 * without it (mirrors the supabase-admin.ts "throw only when first used" pattern).
 */

const ALGO = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

let _key: Buffer | null = null;

function getKey(): Buffer {
  if (_key) return _key;
  const raw = process.env.GDMS_CREDENTIALS_ENC_KEY;
  if (!raw) {
    throw new Error(
      "Missing GDMS_CREDENTIALS_ENC_KEY env var. Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "GDMS_CREDENTIALS_ENC_KEY must decode to exactly 32 bytes (base64). Generate one with: openssl rand -base64 32"
    );
  }
  _key = key;
  return _key;
}

/** Encrypts `plaintext`, returning a single base64 blob: iv(12) + authTag(16) + ciphertext. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

/** Reverses encryptSecret(). Throws if the blob is malformed or the key/tag don't match. */
export function decryptSecret(blob: string): string {
  const key = getKey();
  const buf = Buffer.from(blob, "base64");
  if (buf.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Malformed encrypted secret");
  }
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}
