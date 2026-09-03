import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/db/client';
import { WebhookPayload } from '@/types/meta';
import { N8nIncomingEvent } from '@/lib/n8n/client';

export interface ResolvedTenant {
  tenantId: string;
  connectionId: string;
  connectionType: string;
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string;
}

/**
 * WebhookService — handles Meta webhook verification, signature checks,
 * tenant resolution, deduplication, event normalization, and conversation tracking.
 *
 * Produces N8nIncomingEvent payloads that are the contract between Emote and n8n.
 */
export class WebhookService {
  private supabase = getSupabaseAdmin();

  // ============================================
  // META WEBHOOK VERIFICATION
  // ============================================

  verifyWebhook(mode: string, token: string, challenge: string): string | null {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge;
    }
    return null;
  }

  verifySignature(rawBody: string, signatureHeader: string | null): boolean {
    if (!signatureHeader) return false;
    const appSecret = process.env.META_APP_SECRET;
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

  // ============================================
  // TENANT RESOLUTION
  // ============================================

  async resolveTenant(phoneNumberId: string): Promise<ResolvedTenant | null> {
    const { data, error } = await this.supabase
      .from('whatsapp_phone_numbers')
      .select(`
        tenant_id,
        connection_id,
        meta_phone_number_id,
        display_phone_number,
        meta_connections!inner(connection_type),
        whatsapp_business_accounts!inner(meta_waba_id)
      `)
      .eq('meta_phone_number_id', phoneNumberId)
      .single();

    if (error || !data) return null;

    const connection = data.meta_connections as unknown as { connection_type: string };
    const waba = data.whatsapp_business_accounts as unknown as { meta_waba_id: string };

    return {
      tenantId: data.tenant_id,
      connectionId: data.connection_id,
      connectionType: connection?.connection_type || 'CLOUD_API',
      wabaId: waba?.meta_waba_id || '',
      phoneNumberId: data.meta_phone_number_id,
      displayPhoneNumber: data.display_phone_number || '',
    };
  }

  // ============================================
  // IDEMPOTENCY
  // ============================================

  async isDuplicate(metaMessageId: string): Promise<boolean> {
    if (!metaMessageId) return false;
    const { data } = await this.supabase
      .from('webhook_events')
      .select('id')
      .eq('meta_message_id', metaMessageId)
      .single();
    return !!data;
  }

  async storeEvent(event: {
    tenantId: string | null;
    connectionId: string | null;
    metaMessageId: string | null;
    phoneNumberId: string;
    wabaId: string;
    eventType: string;
    payload: unknown;
    status: string;
  }): Promise<string> {
    const { data, error } = await this.supabase
      .from('webhook_events')
      .insert({
        tenant_id: event.tenantId,
        connection_id: event.connectionId,
        meta_message_id: event.metaMessageId,
        phone_number_id: event.phoneNumberId,
        waba_id: event.wabaId,
        event_type: event.eventType,
        payload: event.payload,
        status: event.status,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === '23505') return 'DUPLICATE';
      throw new Error(`Failed to store webhook event: ${error.message}`);
    }

    return data?.id || '';
  }

  // ============================================
  // CONVERSATION TRACKING
  // ============================================

  async getOrCreateConversation(
    tenantId: string,
    connectionId: string,
    customerPhone: string,
    customerName?: string
  ): Promise<{ id: string; status: string; autoReplyCount: number }> {
    // Try to find existing conversation
    const { data: existing } = await this.supabase
      .from('conversations')
      .select('id, status, auto_reply_count')
      .eq('tenant_id', tenantId)
      .eq('connection_id', connectionId)
      .eq('customer_phone', customerPhone)
      .single();

    if (existing) {
      // Update last message timestamp
      await this.supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString(), customer_name: customerName || undefined })
        .eq('id', existing.id);

      return {
        id: existing.id,
        status: existing.status,
        autoReplyCount: existing.auto_reply_count,
      };
    }

    // Create new conversation
    const { data: newConv, error } = await this.supabase
      .from('conversations')
      .insert({
        tenant_id: tenantId,
        connection_id: connectionId,
        customer_phone: customerPhone,
        customer_name: customerName,
        status: 'ACTIVE',
        last_message_at: new Date().toISOString(),
      })
      .select('id, status, auto_reply_count')
      .single();

    if (error || !newConv) {
      throw new Error(`Failed to create conversation: ${error?.message}`);
    }

    return {
      id: newConv.id,
      status: newConv.status,
      autoReplyCount: newConv.auto_reply_count,
    };
  }

  /**
   * Store an inbound message in conversation history.
   */
  async storeConversationMessage(
    conversationId: string,
    tenantId: string,
    messageType: string,
    content: string | null,
    metaMessageId: string
  ): Promise<void> {
    await this.supabase.from('conversation_messages').insert({
      conversation_id: conversationId,
      tenant_id: tenantId,
      direction: 'inbound',
      message_type: messageType,
      content,
      meta_message_id: metaMessageId,
    });
  }

  // ============================================
  // FULL PAYLOAD PROCESSING
  // ============================================

  /**
   * Process a complete Meta webhook payload into enriched N8nIncomingEvents.
   * This is the main entry point for webhook processing.
   *
   * Flow:
   * 1. Extract entries/changes
   * 2. For each message: resolve tenant → deduplicate → normalize → track conversation
   * 3. Return array of N8nIncomingEvent ready for forwarding
   */
  async processPayload(payload: WebhookPayload): Promise<{ events: N8nIncomingEvent[]; storedEventIds: string[] }> {
    const events: N8nIncomingEvent[] = [];
    const storedEventIds: string[] = [];
    const receivedAt = new Date().toISOString();

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        const phoneNumberId = change.value?.metadata?.phone_number_id;
        const displayPhone = change.value?.metadata?.display_phone_number;
        if (!phoneNumberId) continue;

        // Resolve tenant
        const tenant = await this.resolveTenant(phoneNumberId);
        if (!tenant) {
          console.warn(`[Webhook] No tenant found for phone_number_id: ${phoneNumberId}`);
          continue;
        }

        // ---- PROCESS MESSAGES ----
        if (change.value.messages) {
          for (const message of change.value.messages) {
            // Idempotency check
            if (await this.isDuplicate(message.id)) {
              await this.storeEvent({
                tenantId: tenant.tenantId,
                connectionId: tenant.connectionId,
                metaMessageId: message.id,
                phoneNumberId,
                wabaId: tenant.wabaId,
                eventType: `message.${message.type}`,
                payload: message as unknown,
                status: 'DUPLICATE',
              });
              continue;
            }

            const contact = change.value.contacts?.[0];
            const contactName = contact?.profile?.name || '';
            const eventType = `message.${message.type}`;

            // Store event
            const eventId = await this.storeEvent({
              tenantId: tenant.tenantId,
              connectionId: tenant.connectionId,
              metaMessageId: message.id,
              phoneNumberId,
              wabaId: tenant.wabaId,
              eventType,
              payload: message as unknown,
              status: 'RECEIVED',
            });

            if (eventId && eventId !== 'DUPLICATE') {
              storedEventIds.push(eventId);
            }

            // Track conversation
            const conversation = await this.getOrCreateConversation(
              tenant.tenantId,
              tenant.connectionId,
              message.from,
              contactName
            );

            // Store message in conversation history
            const textContent = message.text?.body || message.image?.caption || message.video?.caption || '';
            await this.storeConversationMessage(
              conversation.id,
              tenant.tenantId,
              message.type,
              textContent,
              message.id
            );

            // Build enriched event for n8n
            const n8nEvent: N8nIncomingEvent = {
              eventId,
              tenantId: tenant.tenantId,
              connectionId: tenant.connectionId,
              wabaId: tenant.wabaId,
              phoneNumberId: tenant.phoneNumberId,
              connectionType: tenant.connectionType,
              customerPhone: message.from,
              businessPhone: displayPhone || tenant.displayPhoneNumber,
              contact: { name: contactName },
              messageId: message.id,
              messageType: message.type,
              text: message.text?.body,
              caption: message.image?.caption || message.video?.caption || message.document?.caption,
              mediaId: message.image?.id || message.audio?.id || message.video?.id || message.document?.id,
              location: message.location,
              eventCategory: 'message',
              eventType,
              timestamp: message.timestamp,
              receivedAt,
              metadata: {
                entryId: entry.id,
                conversationId: conversation.id,
                conversationStatus: conversation.status,
                autoReplyCount: conversation.autoReplyCount,
              },
            };

            events.push(n8nEvent);
          }
        }

        // ---- PROCESS STATUS UPDATES ----
        if (change.value.statuses) {
          for (const status of change.value.statuses) {
            const eventType = `status.${status.status}`;

            const eventId = await this.storeEvent({
              tenantId: tenant.tenantId,
              connectionId: tenant.connectionId,
              metaMessageId: status.id,
              phoneNumberId,
              wabaId: tenant.wabaId,
              eventType,
              payload: status as unknown,
              status: 'RECEIVED',
            });

            if (eventId && eventId !== 'DUPLICATE') {
              storedEventIds.push(eventId);
              // Note: Delivery receipts (status.sent, status.delivered, status.read)
              // are stored in DB for tracking but NEVER forwarded to n8n to avoid auto-reply loops.
            }
          }
        }
      }
    }

    return { events, storedEventIds };
  }

  /**
   * Mark events as forwarded to n8n.
   */
  async markForwarded(eventIds: string[]): Promise<void> {
    if (eventIds.length === 0) return;
    await this.supabase
      .from('webhook_events')
      .update({ status: 'FORWARDED', forwarded_at: new Date().toISOString() })
      .in('id', eventIds);
  }

  /**
   * Mark events as failed.
   */
  async markFailed(eventIds: string[], error: string): Promise<void> {
    if (eventIds.length === 0) return;
    await this.supabase
      .from('webhook_events')
      .update({ status: 'FAILED', error_message: error })
      .in('id', eventIds);
  }
}

// Singleton
let _webhookService: WebhookService | null = null;

export function getWebhookService(): WebhookService {
  if (!_webhookService) {
    _webhookService = new WebhookService();
  }
  return _webhookService;
}
