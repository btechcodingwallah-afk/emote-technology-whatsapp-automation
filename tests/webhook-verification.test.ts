import crypto from 'crypto';

// Mock the WebhookService verify method inline
function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  if (!appSecret) return false;

  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(rawBody)
    .digest('hex');

  const expected = `sha256=${expectedSignature}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signatureHeader)
    );
  } catch {
    return false;
  }
}

describe('Webhook Signature Verification', () => {
  const appSecret = 'test_app_secret_12345';
  const validPayload = JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [{ id: '123', changes: [] }],
  });

  function createValidSignature(body: string): string {
    const sig = crypto.createHmac('sha256', appSecret).update(body).digest('hex');
    return `sha256=${sig}`;
  }

  test('accepts valid signature', () => {
    const signature = createValidSignature(validPayload);
    expect(verifySignature(validPayload, signature, appSecret)).toBe(true);
  });

  test('rejects null signature', () => {
    expect(verifySignature(validPayload, null, appSecret)).toBe(false);
  });

  test('rejects empty signature', () => {
    expect(verifySignature(validPayload, '', appSecret)).toBe(false);
  });

  test('rejects wrong signature', () => {
    const wrongSig = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    expect(verifySignature(validPayload, wrongSig, appSecret)).toBe(false);
  });

  test('rejects signature without sha256= prefix', () => {
    const sig = crypto.createHmac('sha256', appSecret).update(validPayload).digest('hex');
    expect(verifySignature(validPayload, sig, appSecret)).toBe(false);
  });

  test('rejects tampered payload', () => {
    const signature = createValidSignature(validPayload);
    const tamperedPayload = validPayload + 'tampered';
    expect(verifySignature(tamperedPayload, signature, appSecret)).toBe(false);
  });

  test('rejects wrong app secret', () => {
    const signature = createValidSignature(validPayload);
    expect(verifySignature(validPayload, signature, 'wrong_secret')).toBe(false);
  });

  test('handles empty body', () => {
    const signature = createValidSignature('');
    expect(verifySignature('', signature, appSecret)).toBe(true);
  });
});

describe('Webhook Verification (GET)', () => {
  const verifyToken = 'my_verify_token';

  function verifyWebhook(mode: string, token: string, challenge: string): string | null {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }

  test('returns challenge for valid verification request', () => {
    expect(verifyWebhook('subscribe', verifyToken, 'challenge_123')).toBe('challenge_123');
  });

  test('rejects wrong mode', () => {
    expect(verifyWebhook('unsubscribe', verifyToken, 'challenge_123')).toBeNull();
  });

  test('rejects wrong token', () => {
    expect(verifyWebhook('subscribe', 'wrong_token', 'challenge_123')).toBeNull();
  });
});
