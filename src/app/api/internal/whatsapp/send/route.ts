import { NextRequest, NextResponse } from 'next/server';
import { N8nClient } from '@/lib/n8n/client';
import { getSupabaseAdmin } from '@/lib/db/client';
import { decryptToken } from '@/lib/encryption/token';
import { MetaGraphService } from '@/services/meta/MetaGraphService';

interface SendRequestBody {
  tenantId: string;
  connectionId: string;
  to: string;
  type: string;
  message: {
    type: string;
    text?: { body: string };
  };
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-emote-signature');
  const timestamp = request.headers.get('x-emote-timestamp');

  // Verify HMAC signature
  const verification = N8nClient.verifyInternalRequest(rawBody, signature, timestamp);
  if (!verification.valid) {
    return NextResponse.json({ success: false, error: verification.error || 'Unauthorized', code: 'UNAUTHORIZED' }, { status: 401 });
  }

  let body: SendRequestBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON', code: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const { tenantId, connectionId, to, message } = body;
  if (!tenantId || !to || !message?.text?.body) {
    return NextResponse.json({ success: false, error: 'Missing required fields', code: 'MISSING_FIELDS' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  // 1. Verify tenant is active
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('id', tenantId)
    .single();

  if (!tenant || tenant.status !== 'ACTIVE') {
    return NextResponse.json({ success: false, error: 'Tenant is not active', code: 'TENANT_INACTIVE' }, { status: 403 });
  }

  // 2. Load connection
  const { data: connection } = await supabase
    .from('meta_connections')
    .select('id, connection_status')
    .eq('id', connectionId)
    .eq('tenant_id', tenantId)
    .single();

  if (!connection) {
    return NextResponse.json({ success: false, error: 'No active WhatsApp connection for this tenant', code: 'NO_ACTIVE_CONNECTION' }, { status: 404 });
  }

  // 3. Load registered phone number
  const { data: phone } = await supabase
    .from('whatsapp_phone_numbers')
    .select('meta_phone_number_id')
    .eq('connection_id', connection.id)
    .single();

  if (!phone?.meta_phone_number_id) {
    return NextResponse.json({ success: false, error: 'No registered phone number found', code: 'NO_PHONE_NUMBER' }, { status: 404 });
  }

  // 4. Load & decrypt token
  const { data: tokenCred } = await supabase
    .from('token_credentials')
    .select('encrypted_token')
    .eq('connection_id', connection.id)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!tokenCred?.encrypted_token) {
    return NextResponse.json({ success: false, error: 'Access token not found', code: 'TOKEN_NOT_FOUND' }, { status: 404 });
  }

  let accessToken: string;
  try {
    accessToken = decryptToken(tokenCred.encrypted_token);
  } catch (err) {
    console.error('[Internal Send] Failed to decrypt token:', err);
    return NextResponse.json({ success: false, error: 'Failed to decrypt access token', code: 'TOKEN_DECRYPT_FAILED' }, { status: 500 });
  }

  // 5. Send message via Meta Graph API
  try {
    const metaGraph = new MetaGraphService();
    const result = await metaGraph.sendText(phone.meta_phone_number_id, accessToken, to, message.text.body);

    const messageId = result.messages?.[0]?.id || 'unknown';

    // 6. Record outbound message and increment auto-reply count
    const { data: conversation } = await supabase
      .from('conversations')
      .select('id, auto_reply_count')
      .eq('tenant_id', tenantId)
      .eq('customer_phone', to)
      .single();

    if (conversation) {
      await supabase.from('conversation_messages').insert({
        conversation_id: conversation.id,
        tenant_id: tenantId,
        direction: 'outbound',
        message_type: 'text',
        content: message.text.body,
        meta_message_id: messageId,
      });

      await supabase
        .from('conversations')
        .update({
          auto_reply_count: (conversation.auto_reply_count || 0) + 1,
          last_message_at: new Date().toISOString(),
        })
        .eq('id', conversation.id);
    }

    return NextResponse.json({
      success: true,
      messageId,
      phoneNumberId: phone.meta_phone_number_id,
    }, { status: 200 });

  } catch (error) {
    console.error('[Internal Send] Meta Graph API error:', error);
    const messageText = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({
      success: false,
      error: messageText,
      code: 'META_SEND_ERROR',
    }, { status: 500 });
  }
}
