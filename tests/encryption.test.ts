import { encryptToken, decryptToken, generateEncryptionKey } from '../src/lib/encryption/token';

// Set test encryption key
process.env.TOKEN_ENCRYPTION_KEY = 'a'.repeat(64);

describe('Token Encryption', () => {
  const testToken = 'EAAAN6tcBzAUBOxxxxxxxxxxxxxxxxxxxxxxxxxx';

  test('encrypts and decrypts a token correctly', () => {
    const encrypted = encryptToken(testToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(testToken);
  });

  test('encrypted format is iv:authTag:ciphertext', () => {
    const encrypted = encryptToken(testToken);
    const parts = encrypted.split(':');
    expect(parts).toHaveLength(3);
    // IV is 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag is 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
    // Ciphertext is non-empty
    expect(parts[2].length).toBeGreaterThan(0);
  });

  test('each encryption produces unique IV (different ciphertext)', () => {
    const encrypted1 = encryptToken(testToken);
    const encrypted2 = encryptToken(testToken);
    expect(encrypted1).not.toBe(encrypted2);

    // But both decrypt to the same value
    expect(decryptToken(encrypted1)).toBe(testToken);
    expect(decryptToken(encrypted2)).toBe(testToken);
  });

  test('rejects tampered ciphertext', () => {
    const encrypted = encryptToken(testToken);
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    parts[2] = 'ff' + parts[2].slice(2);
    const tampered = parts.join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });

  test('rejects invalid format', () => {
    expect(() => decryptToken('invalid')).toThrow('Invalid encrypted token format');
    expect(() => decryptToken('a:b')).toThrow('Invalid encrypted token format');
  });

  test('generates valid encryption key', () => {
    const key = generateEncryptionKey();
    expect(key).toHaveLength(64);
    expect(/^[0-9a-f]+$/.test(key)).toBe(true);
  });

  test('handles empty string', () => {
    const encrypted = encryptToken('');
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe('');
  });

  test('handles long tokens', () => {
    const longToken = 'x'.repeat(1000);
    const encrypted = encryptToken(longToken);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(longToken);
  });
});
