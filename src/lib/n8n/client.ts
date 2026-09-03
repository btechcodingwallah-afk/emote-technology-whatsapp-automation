import crypto from 'crypto';

/**
 * Enriched normalized event sent from Emote → n8n.
 * This is the contract between the Emote backend and n8n workflows.
 * Contains everything n8n needs to process automation — but NEVER Meta tokens.
 */
export interface N8nIncomingEvent {
  // Identity
  eventId: string;             // Emote's webhook_event.id (idempotency key)
  tenantId: string;
  connectionId: string;
  wabaId: string;
  phoneNumberId: string;
  connectionType: string;      // 'CLOUD_API' | 'COEXISTENCE'

  // Customer
  customerPhone: string;       // sender phone number (wa_id)
  businessPhone: string;       // business phone number (display)
  contact: {
    name: string;
  };

  // Message
  messageId: string;           // Meta's message ID
  messageType: string;         // text, image, audio, video, document, location, interactive, button
  text?: string;               // text body for text messages
  caption?: string;            // caption for media messages
  mediaId?: string;            // Meta media ID for media messages
  location?: { latitude: number; longitude: number; name?: string; address?: string };

  // Event classification
  eventCategory: string;       // 'message' | 'status' | 'system'
  eventType: string;           // 'message.text' | 'message.image' | 'status.delivered' etc.

  // Timestamps
  timestamp: string;           // Meta's message timestamp
  receivedAt: string;          // When Emote received this event

  // Context (safe subset)
  metadata: Record<string, unknown>;
}

// Replay protection window: 5 minutes
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

/**
 * N8nClient — forwards sanitized webhook events from Emote to n8n.
 *
 * Security:
 * - HMAC-SHA256 signature (X-Emote-Signature)
 * - Timestamp header (X-Emote-Timestamp) for replay protection
 * - Tenant ID header (X-Emote-Tenant-Id) for routing
 * - Event type header (X-Emote-Event-Type) for filtering
 *
 * NEVER sends Meta access tokens to n8n.
 */
export class N8nClient {
  private readonly baseUrl: string | null;
  private readonly webhookPath: string;
  private readonly webhookSecret: string | null;

  constructor() {
    this.baseUrl = process.env.N8N_BASE_URL || null;
    this.webhookPath = process.env.N8N_WEBHOOK_PATH || '/webhook/emote/whatsapp/incoming';
    this.webhookSecret = process.env.N8N_WEBHOOK_SECRET || null;
  }

  /**
   * Full webhook URL = N8N_BASE_URL + N8N_WEBHOOK_PATH
   */
  private get webhookUrl(): string | null {
    if (!this.baseUrl) return null;
    return `${this.baseUrl.replace(/\/$/, '')}${this.webhookPath}`;
  }

  /**
   * Check if n8n integration is configured.
   */
  isConfigured(): boolean {
    return !!(this.baseUrl && this.webhookSecret);
  }

  /**
   * Forward a normalized event to n8n with HMAC + timestamp.
   */
  async forwardEvent(event: N8nIncomingEvent): Promise<{ success: boolean; error?: string }> {
    if (!this.isConfigured()) {
      return { success: false, error: 'n8n not configured' };
    }

    const url = this.webhookUrl;
    if (!url) return { success: false, error: 'n8n webhook URL not configured' };

    const timestamp = new Date().toISOString();
    const payload = JSON.stringify(event);
    const signature = this.signPayload(payload, timestamp);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Emote-Signature': signature,
          'X-Emote-Secret': this.webhookSecret || '',
          'X-Emote-Timestamp': timestamp,
          'X-Emote-Tenant-Id': event.tenantId,
          'X-Emote-Event-Type': event.eventType,
          'X-Emote-Event-Id': event.eventId,
        },
        body: payload,
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { success: false, error: `n8n returned ${response.status}: ${text.slice(0, 200)}` };
      }

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`n8n forwarding error: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Forward multiple events in sequence. Returns array of results.
   */
  async forwardEvents(events: N8nIncomingEvent[]): Promise<{ success: number; failed: number; errors: string[] }> {
    let success = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const event of events) {
      const result = await this.forwardEvent(event);
      if (result.success) {
        success++;
      } else {
        failed++;
        if (result.error) errors.push(`[${event.eventId}] ${result.error}`);
      }
    }

    return { success, failed, errors };
  }

  /**
   * Check if the n8n instance is reachable.
   */
  async healthCheck(): Promise<{ reachable: boolean; latencyMs: number; error?: string }> {
    if (!this.baseUrl) {
      return { reachable: false, latencyMs: 0, error: 'N8N_BASE_URL not configured' };
    }

    const start = Date.now();
    try {
      const cleanUrl = this.baseUrl.replace(/\/$/, '');
      const response = await fetch(`${cleanUrl}/healthz`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      const latencyMs = Date.now() - start;
      return { reachable: response.ok, latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      return {
        reachable: false,
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // ============================================
  // HMAC SIGNING
  // ============================================

  /**
   * Create HMAC-SHA256 signature including timestamp for replay protection.
   * Signature = HMAC-SHA256(timestamp + '.' + payload, secret)
   */
  private signPayload(payload: string, timestamp: string): string {
    if (!this.webhookSecret) return '';
    const signatureInput = `${timestamp}.${payload}`;
    return crypto
      .createHmac('sha256', this.webhookSecret)
      .update(signatureInput)
      .digest('hex');
  }

  // ============================================
  // STATIC VERIFICATION (for n8n → Emote callbacks)
  // ============================================

  /**
   * Verify an incoming request from n8n.
   * Checks both HMAC signature and timestamp freshness.
   */
  static verifyInternalRequest(
    rawBody: string,
    signature: string | null,
    timestamp: string | null
  ): { valid: boolean; error?: string } {
    const secret = process.env.N8N_WEBHOOK_SECRET;
    if (!secret) return { valid: false, error: 'N8N_WEBHOOK_SECRET not configured' };
    if (!signature) return { valid: false, error: 'Missing X-Emote-Signature header' };
    if (!timestamp) return { valid: false, error: 'Missing X-Emote-Timestamp header' };

    // Check timestamp freshness (replay protection)
    const requestTime = new Date(timestamp).getTime();
    if (isNaN(requestTime)) return { valid: false, error: 'Invalid timestamp format' };

    const now = Date.now();
    if (Math.abs(now - requestTime) > REPLAY_WINDOW_MS) {
      return { valid: false, error: 'Request timestamp outside acceptable window (possible replay)' };
    }

    // Allow direct secret token (for environments where n8n sandbox blocks crypto module)
    if (signature === secret) {
      return { valid: true };
    }
    const signatureInput = `${timestamp}.${rawBody}`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(signatureInput)
      .digest('hex');

    try {
      const valid = crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(signature)
      );
      return valid
        ? { valid: true }
        : { valid: false, error: 'Invalid signature' };
    } catch {
      return { valid: false, error: 'Signature verification error' };
    }
  }

  /**
   * Legacy compatibility: verify just signature (no timestamp).
   * Used by send API which already exists.
   */
  static verifyInternalSignature(payload: string, signature: string): boolean {
    const secret = process.env.N8N_WEBHOOK_SECRET;
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
}

// Singleton
let _n8nClient: N8nClient | null = null;

export function getN8nClient(): N8nClient {
  if (!_n8nClient) {
    _n8nClient = new N8nClient();
  }
  return _n8nClient;
}
