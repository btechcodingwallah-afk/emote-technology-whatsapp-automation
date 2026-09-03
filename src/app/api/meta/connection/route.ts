import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { getSupabaseAdmin } from '@/lib/db/client';

/**
 * GET /api/meta/connection — Get current tenant's WhatsApp connection status.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const supabase = getSupabaseAdmin();

    // Get active connection
    const { data: connection } = await supabase
      .from('meta_connections')
      .select('*')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!connection) {
      return NextResponse.json({ connection: null });
    }

    // Get WABA
    const { data: waba } = await supabase
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('connection_id', connection.id)
      .single();

    // Get phone number
    const { data: phone } = await supabase
      .from('whatsapp_phone_numbers')
      .select('*')
      .eq('connection_id', connection.id)
      .single();

    // Get last webhook event
    const { data: lastWebhook } = await supabase
      .from('webhook_events')
      .select('created_at, event_type')
      .eq('tenant_id', auth.tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    return NextResponse.json({
      connection: {
        connectionId: connection.id,
        connectionType: connection.connection_type,
        connectionStatus: connection.connection_status,
        onboardingStatus: connection.onboarding_status,
        wabaId: waba?.meta_waba_id || null,
        wabaName: waba?.name || null,
        subscriptionStatus: waba?.subscription_status || null,
        phoneNumberId: phone?.meta_phone_number_id || null,
        displayPhoneNumber: phone?.display_phone_number || null,
        verifiedName: phone?.verified_name || null,
        qualityRating: phone?.quality_rating || null,
        isOnBizApp: phone?.is_on_biz_app || false,
        coexistenceStatus: phone?.coexistence_status || null,
        historySyncStatus: phone?.history_sync_status || null,
        lastSyncAt: phone?.last_sync_at || null,
        lastWebhookAt: lastWebhook?.created_at || null,
        lastWebhookType: lastWebhook?.event_type || null,
        errorMessage: connection.error_message || null,
        createdAt: connection.created_at,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Get connection error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
