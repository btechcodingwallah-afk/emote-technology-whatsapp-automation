import { NextRequest, NextResponse } from 'next/server';
import { getWebhookService } from '@/services/webhook/WebhookService';
import { getN8nClient } from '@/lib/n8n/client';
import { WebhookPayload } from '@/types/meta';

/**
 * GET /api/webhooks/meta/whatsapp
 * Handles Meta webhook verification handshake.
 */
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');

  if (!mode || !token || !challenge) {
    return new NextResponse('Missing required query parameters', { status: 400 });
  }

  const webhookService = getWebhookService();
  const verifiedChallenge = webhookService.verifyWebhook(mode, token, challenge);

  if (verifiedChallenge) {
    return new NextResponse(verifiedChallenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('Forbidden - Invalid verification token', { status: 403 });
}

/**
 * POST /api/webhooks/meta/whatsapp
 * Receives incoming WhatsApp events from Meta, verifies signature,
 * stores & deduplicates, and forwards to n8n.
 */
export async function POST(request: NextRequest) {
  const webhookService = getWebhookService();
  const n8nClient = getN8nClient();

  // Read raw body for HMAC verification
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-hub-signature-256');

  // Verify Meta signature
  const isValid = webhookService.verifySignature(rawBody, signatureHeader);
  if (!isValid) {
    console.warn('[Meta Webhook] Signature verification failed');
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let payload: WebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  // Respond 200 immediately to Meta so it does not time out or retry
  // Process and forward asynchronously
  (async () => {
    try {
      const { events, storedEventIds } = await webhookService.processPayload(payload);

      if (events.length > 0 && n8nClient.isConfigured()) {
        const result = await n8nClient.forwardEvents(events);
        if (result.failed > 0) {
          console.warn(`[Meta Webhook] n8n forward partially failed: ${result.failed}/${events.length}`);
        }
        await webhookService.markForwarded(storedEventIds);
      }
    } catch (err) {
      console.error('[Meta Webhook] Error processing payload:', err);
    }
  })();

  return NextResponse.json({ status: 'EVENT_RECEIVED' }, { status: 200 });
}
