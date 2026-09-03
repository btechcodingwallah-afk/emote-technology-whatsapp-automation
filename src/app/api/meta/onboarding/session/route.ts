import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth/jwt';
import { getOnboardingService } from '@/services/onboarding/OnboardingService';
import { createOnboardingSessionSchema } from '@/schemas';

/**
 * POST /api/meta/onboarding/session — Create a secure onboarding session.
 * Must be called before launching Meta Embedded Signup.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const body = await req.json();
    const parsed = createOnboardingSessionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const onboardingService = getOnboardingService();
    const session = await onboardingService.createSession({
      tenantId: auth.tenantId,
      userId: auth.userId,
      connectionType: parsed.data.connectionType,
    });

    return NextResponse.json(session, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Create onboarding session error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
