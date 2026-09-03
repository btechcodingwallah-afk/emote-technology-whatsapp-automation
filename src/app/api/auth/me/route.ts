import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth/jwt';
import { getSupabaseAdmin } from '@/lib/db/client';

export async function GET(req: NextRequest) {
  try {
    const auth = getAuthFromRequest(req);
    if (!auth) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, name, role, tenant_id, is_active')
      .eq('id', auth.userId)
      .single();

    if (error || !user || !user.is_active) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Also fetch tenant info
    const { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, slug, status')
      .eq('id', user.tenant_id)
      .single();

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tenant: tenant || null,
    });
  } catch (error) {
    console.error('Auth me error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
