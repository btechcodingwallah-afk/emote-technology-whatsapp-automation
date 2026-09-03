import {
  TokenExchangeResponse,
  MetaWABAResponse,
  MetaPhoneNumberResponse,
  MetaSubscribeResponse,
  MetaRegisterResponse,
  MetaSyncResponse,
  SendTextMessage,
  SendTemplateMessage,
  SendMessageResponse,
  MarkReadRequest,
  MetaGraphError,
} from '@/types/meta';

/**
 * MetaGraphService — centralized Meta WhatsApp Cloud API client.
 * All Graph API calls go through this service.
 * Never expose APP_SECRET or customer tokens outside this service.
 */
export class MetaGraphService {
  private readonly baseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;

  constructor() {
    const version = process.env.META_GRAPH_API_VERSION || 'v21.0';
    this.baseUrl = `https://graph.facebook.com/${version}`;
    this.appId = process.env.META_APP_ID!;
    this.appSecret = process.env.META_APP_SECRET!;

    if (!this.appId || !this.appSecret) {
      throw new Error('META_APP_ID and META_APP_SECRET are required');
    }
  }

  // ============================================
  // TOKEN EXCHANGE
  // ============================================

  /**
   * Exchange an authorization code (from Embedded Signup) for a business access token.
   * CRITICAL: Code TTL is ~30 seconds. Call immediately after receiving it.
   */
  async exchangeCodeForToken(code: string): Promise<TokenExchangeResponse> {
    const url = new URL(`${this.baseUrl}/oauth/access_token`);
    url.searchParams.set('client_id', this.appId);
    url.searchParams.set('client_secret', this.appSecret);
    url.searchParams.set('code', code);

    const response = await fetch(url.toString(), { method: 'GET' });
    const data = await response.json();

    if (!response.ok) {
      throw new MetaApiError('Token exchange failed', data as MetaGraphError, response.status);
    }

    return data as TokenExchangeResponse;
  }

  // ============================================
  // WABA OPERATIONS
  // ============================================

  /**
   * Get WhatsApp Business Account details.
   */
  async getWaba(wabaId: string, accessToken: string): Promise<MetaWABAResponse> {
    const url = `${this.baseUrl}/${wabaId}`;
    return this.makeRequest<MetaWABAResponse>(url, 'GET', accessToken);
  }

  /**
   * Subscribe the Emote app to a customer's WABA.
   * Required for receiving webhook events for this WABA.
   */
  async subscribeWaba(wabaId: string, accessToken: string): Promise<MetaSubscribeResponse> {
    const url = `${this.baseUrl}/${wabaId}/subscribed_apps`;
    return this.makeRequest<MetaSubscribeResponse>(url, 'POST', accessToken);
  }

  // ============================================
  // PHONE NUMBER OPERATIONS
  // ============================================

  /**
   * Get phone number details including coexistence status.
   */
  async getPhoneNumber(phoneNumberId: string, accessToken: string): Promise<MetaPhoneNumberResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating,platform_type,is_on_biz_app,code_verification_status,name_status`;
    return this.makeRequest<MetaPhoneNumberResponse>(url, 'GET', accessToken);
  }

  /**
   * Register a phone number for Cloud API.
   * DO NOT call for Coexistence numbers — they are already registered via mobile app.
   */
  async registerPhoneNumber(phoneNumberId: string, accessToken: string, pin: string): Promise<MetaRegisterResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}/register`;
    return this.makeRequest<MetaRegisterResponse>(url, 'POST', accessToken, {
      messaging_product: 'whatsapp',
      pin,
    });
  }

  /**
   * Check if a phone number is on WhatsApp Business App (coexistence check).
   */
  async verifyCoexistenceStatus(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{ is_on_biz_app: boolean; platform_type: string }> {
    const url = `${this.baseUrl}/${phoneNumberId}?fields=is_on_biz_app,platform_type`;
    return this.makeRequest(url, 'GET', accessToken);
  }

  // ============================================
  // COEXISTENCE SYNC
  // ============================================

  /**
   * Initiate contact/state sync for Coexistence accounts.
   * Must be called within 24 hours of onboarding.
   */
  async syncAppData(
    phoneNumberId: string,
    accessToken: string,
    syncType: 'smb_app_state_sync' | 'history'
  ): Promise<MetaSyncResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}/smb_app_data`;
    return this.makeRequest<MetaSyncResponse>(url, 'POST', accessToken, {
      messaging_product: 'whatsapp',
      sync_type: syncType,
    });
  }

  // ============================================
  // MESSAGING
  // ============================================

  /**
   * Send a text message.
   */
  async sendText(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    body: string,
    previewUrl: boolean = false
  ): Promise<SendMessageResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const message: SendTextMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { preview_url: previewUrl, body },
    };
    return this.makeRequest<SendMessageResponse>(url, 'POST', accessToken, message);
  }

  /**
   * Send a template message.
   */
  async sendTemplate(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    components?: SendTemplateMessage['template']['components']
  ): Promise<SendMessageResponse> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const message: SendTemplateMessage = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };
    return this.makeRequest<SendMessageResponse>(url, 'POST', accessToken, message);
  }

  /**
   * Mark a message as read.
   */
  async markRead(phoneNumberId: string, accessToken: string, messageId: string): Promise<{ success: boolean }> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const payload: MarkReadRequest = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    };
    return this.makeRequest(url, 'POST', accessToken, payload);
  }

  // ============================================
  // CONNECTION HEALTH
  // ============================================

  /**
   * Verify the connection by fetching WABA details.
   * Returns true if token and WABA are valid.
   */
  async verifyConnection(wabaId: string, accessToken: string): Promise<boolean> {
    try {
      await this.getWaba(wabaId, accessToken);
      return true;
    } catch {
      return false;
    }
  }

  // ============================================
  // INTERNAL HTTP CLIENT
  // ============================================

  private async makeRequest<T>(
    url: string,
    method: 'GET' | 'POST' | 'DELETE',
    accessToken: string,
    body?: unknown
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);
    const data = await response.json();

    if (!response.ok) {
      throw new MetaApiError(
        `Meta API error: ${method} ${url}`,
        data as MetaGraphError,
        response.status
      );
    }

    return data as T;
  }
}

// ============================================
// META API ERROR CLASS
// ============================================

export class MetaApiError extends Error {
  public readonly statusCode: number;
  public readonly metaError: MetaGraphError | null;
  public readonly metaErrorCode: number | null;
  public readonly metaErrorSubcode: number | null;

  constructor(message: string, metaResponse: MetaGraphError | null, statusCode: number) {
    const metaMsg = metaResponse?.error?.message;
    super(metaMsg ? `${message}: ${metaMsg}` : message);
    this.name = 'MetaApiError';
    this.statusCode = statusCode;
    this.metaError = metaResponse;
    this.metaErrorCode = metaResponse?.error?.code || null;
    this.metaErrorSubcode = metaResponse?.error?.error_subcode || null;
  }

  /**
   * Map Meta error to a user-friendly message.
   */
  toUserMessage(): string {
    const code = this.metaErrorCode;
    const subcode = this.metaErrorSubcode;

    if (code === 190) return 'Your WhatsApp authorization has expired. Please reconnect.';
    if (code === 100 && subcode === 33) return 'This phone number is not eligible for the selected onboarding mode.';
    if (code === 100) return 'Invalid request. Please check your WhatsApp configuration.';
    if (code === 4) return 'Meta rate limit reached. Please try again later.';
    if (code === 10) return 'Required WhatsApp permissions are missing. Contact support.';
    if (code === 200) return 'WhatsApp permission denied. Please check your business verification.';
    if (code === 368) return 'Your WhatsApp Business Account is temporarily restricted.';
    if (code === 131031) return 'This phone number is already registered with another account.';
    if (this.statusCode === 401) return 'WhatsApp authorization failed. Please reconnect.';
    if (this.statusCode === 403) return 'Access denied by WhatsApp. Check business verification.';
    if (this.statusCode >= 500) return 'Meta servers are temporarily unavailable. Please try again.';

    return 'An error occurred with WhatsApp. Please try again or contact support.';
  }
}

// Singleton
let _metaService: MetaGraphService | null = null;

export function getMetaGraphService(): MetaGraphService {
  if (!_metaService) {
    _metaService = new MetaGraphService();
  }
  return _metaService;
}
