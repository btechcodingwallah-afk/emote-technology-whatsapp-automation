import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { getOnboardingService } from '@/services/onboarding/OnboardingService';
import { completeSignupSchema } from '@/schemas';
import { MetaApiError } from '@/services/meta/MetaGraphService';

/**
 * POST /api/meta/embedded-signup/complete — Complete Embedded Signup flow.
 * Receives authorization code from frontend, exchanges for token,
 * provisions WABA connection, and activates webhooks.
 *
 * CRITICAL: Authorization code has ~30 second TTL. Must process immediately.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json();
    const parsed = completeSignupSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const onboardingService = getOnboardingService();
    const result = await onboardingService.completeSignup({
      sessionId: parsed.data.sessionId,
      code: parsed.data.code,
      tenantId: auth.tenantId,
      userId: auth.userId,
      sessionInfo: parsed.data.sessionInfo,
      eventType: parsed.data.eventType,
    });

    return NextResponse.json({
      success: true,
      connection: {
        id: result.connectionId,
        wabaId: result.wabaId,
        phoneNumberId: result.phoneNumberId,
        connectionType: result.connectionType,
        status: result.status,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (error instanceof MetaApiError) {
      return NextResponse.json(
        {
          error: error.toUserMessage(),
          code: error.metaErrorCode,
        },
        { status: error.statusCode >= 500 ? 502 : 400 }
      );
    }

    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Complete signup error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
