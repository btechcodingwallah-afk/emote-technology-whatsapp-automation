import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/db/client';
import { signToken } from '@/lib/auth/jwt';
import { loginSchema } from '@/schemas';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { email, password } = parsed.data;
    const supabase = getSupabaseAdmin();

    // Find user by email
    const { data: user, error } = await supabase
      .from('users')
      .select('id, tenant_id, email, password_hash, name, role, is_active')
      .eq('email', email.toLowerCase())
      .single();

    if (error || !user) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    if (!user.is_active) {
      return NextResponse.json({ error: 'Account is disabled' }, { status: 403 });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // Update last login
    await supabase.from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id);

    // Generate JWT
    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });

    const response = NextResponse.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        tenantId: user.tenant_id,
      },
    });

    // Also set as HTTP-only cookie
    response.cookies.set('emote_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
