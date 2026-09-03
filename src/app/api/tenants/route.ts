import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getSupabaseAdmin } from '@/lib/db/client';
import { requireAuth } from '@/lib/auth/jwt';
import { createTenantSchema } from '@/schemas';

/**
 * POST /api/tenants — Create a new tenant with admin user.
 * This is an admin-level operation.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createTenantSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { name, slug, adminEmail, adminPassword, adminName } = parsed.data;
    const supabase = getSupabaseAdmin();

    // Check if slug already exists
    const { data: existing } = await supabase
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .single();

    if (existing) {
      return NextResponse.json({ error: 'Tenant slug already exists' }, { status: 409 });
    }

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', adminEmail.toLowerCase())
      .single();

    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 });
    }

    // Create tenant
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .insert({ name, slug, status: 'ACTIVE' })
      .select('id')
      .single();

    if (tenantError || !tenant) {
      return NextResponse.json(
        { error: `Failed to create tenant: ${tenantError?.message}` },
        { status: 500 }
      );
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert({
        tenant_id: tenant.id,
        email: adminEmail.toLowerCase(),
        password_hash: passwordHash,
        name: adminName,
        role: 'OWNER',
        is_active: true,
      })
      .select('id, email, name, role')
      .single();

    if (userError || !user) {
      // Rollback tenant creation
      await supabase.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { error: `Failed to create admin user: ${userError?.message}` },
        { status: 500 }
      );
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      tenant_id: tenant.id,
      user_id: user.id,
      action: 'TENANT_CREATED',
      resource_type: 'tenant',
      resource_id: tenant.id,
      details: { name, slug },
    });

    return NextResponse.json(
      {
        tenant: { id: tenant.id, name, slug },
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * GET /api/tenants — Get current tenant details.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = requireAuth(req);
    const supabase = getSupabaseAdmin();

    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('id', auth.tenantId)
      .single();

    if (error || !tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    return NextResponse.json({ tenant });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthError') {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    console.error('Get tenant error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
