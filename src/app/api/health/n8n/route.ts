import { NextResponse } from 'next/server';
import { getN8nClient } from '@/lib/n8n/client';

export async function GET() {
  const n8nClient = getN8nClient();
  const health = await n8nClient.healthCheck();

  return NextResponse.json({
    status: health.reachable ? 'healthy' : 'unreachable',
    configured: n8nClient.isConfigured(),
    ...health,
  }, { status: health.reachable ? 200 : 503 });
}
