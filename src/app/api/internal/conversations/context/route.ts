import { NextRequest, NextResponse } from 'next/server';
import { N8nClient } from '@/lib/n8n/client';
import { getSupabaseAdmin } from '@/lib/db/client';

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get('x-emote-signature');
  const timestamp = request.headers.get('x-emote-timestamp');

  const verification = N8nClient.verifyInternalRequest(rawBody, signature, timestamp);
  if (!verification.valid) {
    return NextResponse.json({ error: verification.error || 'Unauthorized' }, { status: 401 });
  }

  let body: { tenantId: string; connectionId: string; customerPhone: string; status: string };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { tenantId, connectionId, customerPhone, status } = body;
  if (!tenantId || !customerPhone || !status) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .match({
      tenant_id: tenantId,
      customer_phone: customerPhone,
      ...(connectionId ? { connection_id: connectionId } : {}),
    })
    .select('id, status')
    .single();

  if (error) {
    console.error('[Conversations Context] Update error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, conversation: data }, { status: 200 });
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const tenantId = searchParams.get('tenantId');
  const customerPhone = searchParams.get('customerPhone');

  if (!tenantId || !customerPhone) {
    return NextResponse.json({ error: 'tenantId and customerPhone required' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, status, auto_reply_count, last_message_at, customer_name')
    .match({ tenant_id: tenantId, customer_phone: customerPhone })
    .single();

  return NextResponse.json({ conversation: conversation || null }, { status: 200 });
}
