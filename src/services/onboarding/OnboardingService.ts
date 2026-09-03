import crypto from 'crypto';
import { getSupabaseAdmin } from '@/lib/db/client';
import { getMetaGraphService, MetaApiError } from '@/services/meta/MetaGraphService';
import { encryptToken } from '@/lib/encryption/token';
import { ConnectionType, EmbeddedSignupEventData } from '@/types/meta';

export interface CreateSessionInput {
  tenantId: string;
  userId: string;
  connectionType: ConnectionType;
}

export interface CompleteSignupInput {
  sessionId: string;
  code: string;
  tenantId: string;
  userId: string;
  sessionInfo: EmbeddedSignupEventData;
  eventType: string;
}

export interface OnboardingResult {
  connectionId: string;
  wabaId: string;
  phoneNumberId: string;
  connectionType: ConnectionType;
  status: string;
}

/**
 * OnboardingService — handles the complete Embedded Signup lifecycle.
 * Creates secure sessions, exchanges tokens, provisions connections.
 */
export class OnboardingService {
  private meta = getMetaGraphService();
  private supabase = getSupabaseAdmin();

  /**
   * Create a secure onboarding session before launching Embedded Signup.
   * Session has a 15-minute expiry window.
   */
  async createSession(input: CreateSessionInput): Promise<{ sessionId: string; nonce: string; state: string }> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const state = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    const { data, error } = await this.supabase
      .from('onboarding_sessions')
      .insert({
        tenant_id: input.tenantId,
        user_id: input.userId,
        nonce,
        state,
        connection_type: input.connectionType,
        status: 'PENDING',
        expires_at: expiresAt.toISOString(),
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error(`Failed to create onboarding session: ${error?.message}`);
    }

    // Audit log
    await this.auditLog(input.tenantId, input.userId, 'META_SIGNUP_STARTED', 'onboarding_session', data.id, {
      connectionType: input.connectionType,
    });

    return { sessionId: data.id, nonce, state };
  }

  /**
   * Complete the Embedded Signup flow.
   * Validates session → exchanges code → provisions connection.
   */
  async completeSignup(input: CompleteSignupInput): Promise<OnboardingResult> {
    // 1. Validate session
    const session = await this.validateSession(input.sessionId, input.tenantId);

    // 2. Update session status
    await this.updateSessionStatus(input.sessionId, 'PROCESSING', { eventType: input.eventType });

    // 3. Determine connection type from event
    const connectionType = this.determineConnectionType(input.eventType, session.connection_type);

    try {
      // 4. Exchange authorization code for token (30s TTL!)
      const tokenResponse = await this.meta.exchangeCodeForToken(input.code);

      await this.updateOnboardingStatus(input.sessionId, 'META_AUTHORIZED');
      await this.auditLog(input.tenantId, input.userId, 'META_TOKEN_EXCHANGED', 'onboarding_session', input.sessionId);

      // 5. Extract WABA and phone number IDs from session info
      const wabaId = input.sessionInfo.waba_id;
      const phoneNumberId = input.sessionInfo.phone_number_id;
      const businessId = input.sessionInfo.business_id;

      if (!wabaId) {
        throw new Error('WABA ID not returned from Embedded Signup');
      }

      // 6. Create Meta connection record
      const { data: connection, error: connError } = await this.supabase
        .from('meta_connections')
        .insert({
          tenant_id: input.tenantId,
          meta_business_id: businessId,
          connection_type: connectionType,
          connection_status: 'PENDING',
          onboarding_status: 'TOKEN_EXCHANGED',
        })
        .select('id')
        .single();

      if (connError || !connection) {
        throw new Error(`Failed to create connection: ${connError?.message}`);
      }

      // 7. Store encrypted token
      const encrypted = encryptToken(tokenResponse.access_token);
      await this.supabase.from('token_credentials').insert({
        tenant_id: input.tenantId,
        connection_id: connection.id,
        encrypted_token: encrypted,
        token_type: tokenResponse.token_type || 'bearer',
        status: 'ACTIVE',
      });

      // 8. Fetch and store WABA details
      const wabaDetails = await this.meta.getWaba(wabaId, tokenResponse.access_token);
      const { data: wabaRecord } = await this.supabase
        .from('whatsapp_business_accounts')
        .upsert({
          tenant_id: input.tenantId,
          connection_id: connection.id,
          meta_waba_id: wabaId,
          name: wabaDetails.name,
          currency: wabaDetails.currency,
          timezone_id: wabaDetails.timezone_id,
          message_template_namespace: wabaDetails.message_template_namespace,
        }, { onConflict: 'meta_waba_id' })
        .select('id')
        .single();

      // 9. Subscribe app to WABA
      await this.meta.subscribeWaba(wabaId, tokenResponse.access_token);
      await this.supabase
        .from('whatsapp_business_accounts')
        .update({ subscription_status: 'ACTIVE', subscribed_at: new Date().toISOString() })
        .eq('meta_waba_id', wabaId);

      await this.updateOnboardingStatus(input.sessionId, 'WABA_SUBSCRIBED');
      await this.auditLog(input.tenantId, input.userId, 'WABA_SUBSCRIBED', 'whatsapp_business_account', wabaId);

      // 10. Handle phone number (if provided)
      let phoneRecord = null;
      if (phoneNumberId) {
        const phoneDetails = await this.meta.getPhoneNumber(phoneNumberId, tokenResponse.access_token);

        phoneRecord = await this.supabase
          .from('whatsapp_phone_numbers')
          .upsert({
            tenant_id: input.tenantId,
            connection_id: connection.id,
            waba_id: wabaRecord?.id,
            meta_phone_number_id: phoneNumberId,
            display_phone_number: phoneDetails.display_phone_number,
            verified_name: phoneDetails.verified_name,
            quality_rating: phoneDetails.quality_rating,
            platform_type: phoneDetails.platform_type,
            is_on_biz_app: phoneDetails.is_on_biz_app || false,
          }, { onConflict: 'meta_phone_number_id' })
          .select('id')
          .single();

        // 11. Register phone (Cloud API only) or sync (Coexistence)
        if (connectionType === 'CLOUD_API') {
          // Generate a random 6-digit PIN for two-step verification
          const pin = String(Math.floor(100000 + Math.random() * 900000));
          await this.meta.registerPhoneNumber(phoneNumberId, tokenResponse.access_token, pin);

          await this.supabase
            .from('whatsapp_phone_numbers')
            .update({ is_registered: true })
            .eq('meta_phone_number_id', phoneNumberId);

          await this.updateOnboardingStatus(input.sessionId, 'PHONE_REGISTERED');
          await this.auditLog(input.tenantId, input.userId, 'PHONE_REGISTERED', 'whatsapp_phone_number', phoneNumberId);
        } else if (connectionType === 'COEXISTENCE') {
          // DO NOT register — phone is already registered via mobile app
          // Initiate contact and history sync
          await this.supabase
            .from('whatsapp_phone_numbers')
            .update({
              is_registered: true,
              is_on_biz_app: true,
              coexistence_status: 'SYNCING',
              history_sync_status: 'SYNCING',
            })
            .eq('meta_phone_number_id', phoneNumberId);

          // Initiate syncs (must be done within 24 hours)
          try {
            await this.meta.syncAppData(phoneNumberId, tokenResponse.access_token, 'smb_app_state_sync');
            await this.meta.syncAppData(phoneNumberId, tokenResponse.access_token, 'history');
          } catch (syncError) {
            console.error('Coexistence sync initiation error (non-fatal):', syncError);
            // Non-fatal: sync can be retried
          }

          await this.updateOnboardingStatus(input.sessionId, 'SYNCING');
          await this.auditLog(input.tenantId, input.userId, 'COEXISTENCE_CONNECTED', 'whatsapp_phone_number', phoneNumberId);
        }
      }

      // 12. Mark connection as active
      const finalStatus = connectionType === 'COEXISTENCE' ? 'SYNCING' : 'CONNECTED';
      await this.supabase
        .from('meta_connections')
        .update({
          connection_status: 'ACTIVE',
          onboarding_status: finalStatus,
        })
        .eq('id', connection.id);

      // 13. Complete session
      await this.supabase
        .from('onboarding_sessions')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', input.sessionId);

      await this.auditLog(input.tenantId, input.userId, 'META_SIGNUP_COMPLETED', 'meta_connection', connection.id, {
        connectionType,
        wabaId,
        phoneNumberId,
      });

      return {
        connectionId: connection.id,
        wabaId,
        phoneNumberId: phoneNumberId || '',
        connectionType,
        status: finalStatus,
      };
    } catch (error) {
      // Mark session and connection as failed
      await this.supabase
        .from('onboarding_sessions')
        .update({
          status: 'FAILED',
          session_data: { error: error instanceof Error ? error.message : 'Unknown error' },
        })
        .eq('id', input.sessionId);

      await this.auditLog(input.tenantId, input.userId, 'CONNECTION_FAILED', 'onboarding_session', input.sessionId, {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    }
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private async validateSession(sessionId: string, tenantId: string) {
    const { data: session, error } = await this.supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('id', sessionId)
      .eq('tenant_id', tenantId)
      .single();

    if (error || !session) {
      throw new Error('Invalid onboarding session');
    }

    if (session.status === 'COMPLETED') {
      throw new Error('Session already completed');
    }

    if (session.status === 'FAILED') {
      throw new Error('Session has failed. Please start a new connection.');
    }

    if (new Date(session.expires_at) < new Date()) {
      throw new Error('Onboarding session has expired. Please try again.');
    }

    return session;
  }

  private determineConnectionType(eventType: string, defaultType: ConnectionType): ConnectionType {
    if (eventType === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
      return 'COEXISTENCE';
    }
    return defaultType;
  }

  private async updateSessionStatus(sessionId: string, status: string, data?: Record<string, unknown>) {
    const updateData: Record<string, unknown> = { status };
    if (data) {
      updateData.session_data = data;
    }
    await this.supabase.from('onboarding_sessions').update(updateData).eq('id', sessionId);
  }

  private async updateOnboardingStatus(sessionId: string, status: string) {
    await this.supabase.from('onboarding_sessions').update({ status }).eq('id', sessionId);
  }

  private async auditLog(
    tenantId: string,
    userId: string,
    action: string,
    resourceType?: string,
    resourceId?: string,
    details?: Record<string, unknown>
  ) {
    await this.supabase.from('audit_logs').insert({
      tenant_id: tenantId,
      user_id: userId,
      action,
      resource_type: resourceType,
      resource_id: resourceId,
      details: details || {},
    });
  }
}

// Singleton
let _onboardingService: OnboardingService | null = null;

export function getOnboardingService(): OnboardingService {
  if (!_onboardingService) {
    _onboardingService = new OnboardingService();
  }
  return _onboardingService;
}
