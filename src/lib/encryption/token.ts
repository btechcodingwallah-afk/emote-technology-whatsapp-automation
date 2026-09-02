import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const ENCODING: BufferEncoding = 'hex';

function getEncryptionKey(): Buffer {
  const key = process.env.TOKEN_ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be at least 64 hex characters');
  }
  return Buffer.from(key.slice(0, 64), 'hex');
}

/**
 * Encrypts a token using AES-256-GCM.
 * Returns format: iv:authTag:ciphertext (all hex-encoded)
 * Each encryption uses a unique random IV.
 */
export function encryptToken(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', ENCODING);
  encrypted += cipher.final(ENCODING);

  const authTag = cipher.getAuthTag();

  return `${iv.toString(ENCODING)}:${authTag.toString(ENCODING)}:${encrypted}`;
}

/**
 * Decrypts a token encrypted with encryptToken().
 * Input format: iv:authTag:ciphertext (all hex-encoded)
 */
export function decryptToken(encryptedValue: string): string {
  const key = getEncryptionKey();
  const parts = encryptedValue.split(':');

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted token format');
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, ENCODING);
  const authTag = Buffer.from(authTagHex, ENCODING);

  if (iv.length !== IV_LENGTH) {
    throw new Error('Invalid IV length');
  }
  if (authTag.length !== AUTH_TAG_LENGTH) {
    throw new Error('Invalid auth tag length');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, ENCODING, 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Generates a random encryption key (64 hex chars = 32 bytes).
 * Use this to generate TOKEN_ENCRYPTION_KEY for .env
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}
