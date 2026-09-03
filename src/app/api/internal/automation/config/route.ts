import { NextRequest, NextResponse } from 'next/server';
import { N8nClient } from '@/lib/n8n/client';
import { getSupabaseAdmin } from '@/lib/db/client';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tenantId = searchParams.get('tenantId');
  const connectionId = searchParams.get('connectionId');

  const signature = request.headers.get('x-emote-signature');
  const timestamp = request.headers.get('x-emote-timestamp');

  // Verify HMAC signature
  const rawQuery = `?tenantId=${tenantId}&connectionId=${connectionId}`;
  const verification = N8nClient.verifyInternalRequest(rawQuery, signature, timestamp);

  if (!verification.valid) {
    return NextResponse.json({ error: verification.error || 'Unauthorized' }, { status: 401 });
  }

  if (!tenantId) {
    return NextResponse.json({ error: 'tenantId is required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: dbConfig } = await supabase
    .from('tenant_automation_configs')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  const config = dbConfig
    ? {
        enabled: dbConfig.enabled,
        mode: dbConfig.mode,
        welcomeMessage: dbConfig.welcome_message,
        humanHandoffEnabled: dbConfig.human_handoff_enabled,
        humanHandoffKeywords: dbConfig.human_handoff_keywords,
        humanHandoffMessage: dbConfig.human_handoff_message,
        fallbackMessage: dbConfig.fallback_message,
        maxAutoRepliesPerConversation: dbConfig.max_auto_replies_per_conversation,
        aiEnabled: dbConfig.ai_enabled,
      }
    : {
        enabled: true,
        mode: 'AUTO',
        welcomeMessage: 'Hello! How can we help you?',
        humanHandoffEnabled: true,
        humanHandoffKeywords: ['human', 'agent', 'person', 'help'],
        humanHandoffMessage: 'Connecting you with a team member.',
        fallbackMessage: 'Thank you for reaching out. We will get back to you shortly.',
        maxAutoRepliesPerConversation: 50,
        aiEnabled: false,
      };

  return NextResponse.json({ config }, { status: 200 });
}
