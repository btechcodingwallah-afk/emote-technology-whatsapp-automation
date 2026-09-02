import { NextRequest } from 'next/server';
import { getAuthFromRequest, JWTPayload } from '@/lib/auth/jwt';
import { getSupabaseAdmin } from '@/lib/db/client';

export interface TenantContext {
  auth: JWTPayload;
  tenantId: string;
}

/**
 * Validates that the request is authenticated and the tenant exists.
 * Returns a TenantContext for downstream use.
 */
export async function requireTenantContext(req: NextRequest): Promise<TenantContext> {
  const auth = getAuthFromRequest(req);
  if (!auth) {
    throw new TenantError('Authentication required', 401);
  }

  const supabase = getSupabaseAdmin();
  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('id, status')
    .eq('id', auth.tenantId)
    .single();

  if (error || !tenant) {
    throw new TenantError('Tenant not found', 404);
  }

  if (tenant.status !== 'ACTIVE') {
    throw new TenantError('Tenant is suspended', 403);
  }

  return {
    auth,
    tenantId: auth.tenantId,
  };
}

/**
 * Validates that a resource belongs to the given tenant.
 * Prevents cross-tenant data access.
 */
export async function validateTenantOwnership(
  table: string,
  resourceId: string,
  tenantId: string
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('id', resourceId)
    .eq('tenant_id', tenantId)
    .single();

  if (error || !data) return false;
  return true;
}

export class TenantError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'TenantError';
    this.statusCode = statusCode;
  }
}
