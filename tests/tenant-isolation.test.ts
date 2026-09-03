import crypto from 'crypto';

// Test the n8n internal signature verification
function verifyInternalSignature(payload: string, signature: string, secret: string): boolean {
  if (!secret || !signature) return false;

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

function signPayload(payload: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}

describe('Internal n8n Signature', () => {
  const secret = 'test_n8n_webhook_secret';
  const payload = JSON.stringify({ tenantId: '123', to: '+1234567890', type: 'text' });

  test('verifies valid signature', () => {
    const sig = signPayload(payload, secret);
    expect(verifyInternalSignature(payload, sig, secret)).toBe(true);
  });

  test('rejects invalid signature', () => {
    expect(verifyInternalSignature(payload, 'invalid', secret)).toBe(false);
  });

  test('rejects empty signature', () => {
    expect(verifyInternalSignature(payload, '', secret)).toBe(false);
  });

  test('rejects with wrong secret', () => {
    const sig = signPayload(payload, secret);
    expect(verifyInternalSignature(payload, sig, 'wrong_secret')).toBe(false);
  });
});

describe('Tenant Isolation — Message Sending', () => {
  // Simulates the internal send endpoint logic
  function validateSendRequest(
    requestTenantId: string,
    connectionTenantId: string,
    phoneNumberTenantId: string
  ): { valid: boolean; error?: string } {
    // The server must derive phone number from tenant, not trust client input
    if (requestTenantId !== connectionTenantId) {
      return { valid: false, error: 'Connection does not belong to tenant' };
    }
    if (requestTenantId !== phoneNumberTenantId) {
      return { valid: false, error: 'Phone number does not belong to tenant' };
    }
    return { valid: true };
  }

  test('allows same-tenant access', () => {
    const result = validateSendRequest('tenant-1', 'tenant-1', 'tenant-1');
    expect(result.valid).toBe(true);
  });

  test('prevents cross-tenant connection access', () => {
    const result = validateSendRequest('tenant-1', 'tenant-2', 'tenant-1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Connection does not belong');
  });

  test('prevents cross-tenant phone number access', () => {
    const result = validateSendRequest('tenant-1', 'tenant-1', 'tenant-2');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Phone number does not belong');
  });
});

describe('Onboarding Session Validation', () => {
  function validateSession(session: {
    tenant_id: string;
    status: string;
    expires_at: string;
  }, requestTenantId: string): { valid: boolean; error?: string } {
    if (session.tenant_id !== requestTenantId) {
      return { valid: false, error: 'Session does not belong to tenant' };
    }
    if (session.status === 'COMPLETED') {
      return { valid: false, error: 'Session already completed' };
    }
    if (session.status === 'FAILED') {
      return { valid: false, error: 'Session has failed' };
    }
    if (new Date(session.expires_at) < new Date()) {
      return { valid: false, error: 'Session expired' };
    }
    return { valid: true };
  }

  test('accepts valid session', () => {
    const result = validateSession({
      tenant_id: 'tenant-1',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }, 'tenant-1');
    expect(result.valid).toBe(true);
  });

  test('rejects cross-tenant session', () => {
    const result = validateSession({
      tenant_id: 'tenant-2',
      status: 'PENDING',
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }, 'tenant-1');
    expect(result.valid).toBe(false);
  });

  test('rejects expired session', () => {
    const result = validateSession({
      tenant_id: 'tenant-1',
      status: 'PENDING',
      expires_at: new Date(Date.now() - 60000).toISOString(),
    }, 'tenant-1');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('expired');
  });

  test('rejects completed session', () => {
    const result = validateSession({
      tenant_id: 'tenant-1',
      status: 'COMPLETED',
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }, 'tenant-1');
    expect(result.valid).toBe(false);
  });

  test('rejects failed session', () => {
    const result = validateSession({
      tenant_id: 'tenant-1',
      status: 'FAILED',
      expires_at: new Date(Date.now() + 60000).toISOString(),
    }, 'tenant-1');
    expect(result.valid).toBe(false);
  });
});

describe('Duplicate Webhook Detection', () => {
  const processedIds = new Set<string>();

  function isDuplicate(messageId: string | null): boolean {
    if (!messageId) return false;
    if (processedIds.has(messageId)) return true;
    processedIds.add(messageId);
    return false;
  }

  beforeEach(() => {
    processedIds.clear();
  });

  test('first message is not a duplicate', () => {
    expect(isDuplicate('msg_001')).toBe(false);
  });

  test('second same message is a duplicate', () => {
    isDuplicate('msg_001');
    expect(isDuplicate('msg_001')).toBe(true);
  });

  test('different messages are not duplicates', () => {
    isDuplicate('msg_001');
    expect(isDuplicate('msg_002')).toBe(false);
  });

  test('null message ID is never a duplicate', () => {
    expect(isDuplicate(null)).toBe(false);
    expect(isDuplicate(null)).toBe(false);
  });
});
