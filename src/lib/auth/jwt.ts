import jwt from 'jsonwebtoken';
import { NextRequest } from 'next/server';

export interface JWTPayload {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET not configured');
  return secret;
}

export function signToken(payload: JWTPayload): string {
  const expiresIn = process.env.JWT_EXPIRES_IN || '7d';
  return jwt.sign(payload, getSecret(), { expiresIn });
}

export function verifyToken(token: string): JWTPayload {
  return jwt.verify(token, getSecret()) as JWTPayload;
}

export function extractTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  const cookie = req.cookies.get('emote_token');
  return cookie?.value || null;
}

export function getAuthFromRequest(req: NextRequest): JWTPayload | null {
  const token = extractTokenFromRequest(req);
  if (!token) return null;

  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

/**
 * Middleware helper: require authenticated user.
 * Returns the JWT payload or throws.
 */
export function requireAuth(req: NextRequest): JWTPayload {
  const auth = getAuthFromRequest(req);
  if (!auth) {
    throw new AuthError('Authentication required');
  }
  return auth;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}
