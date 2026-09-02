import { z } from 'zod';

const envSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),

  // Meta
  NEXT_PUBLIC_META_APP_ID: z.string().min(1),
  NEXT_PUBLIC_META_CONFIG_ID: z.string().min(1),
  META_APP_ID: z.string().min(1),
  META_APP_SECRET: z.string().min(1),
  META_GRAPH_API_VERSION: z.string().default('v21.0'),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1),

  // Security
  TOKEN_ENCRYPTION_KEY: z.string().min(64),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // n8n
  N8N_BASE_URL: z.string().url().optional(),
  N8N_WEBHOOK_URL: z.string().url().optional(),
  N8N_WEBHOOK_SECRET: z.string().min(1).optional(),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

export function getEnv(): Env {
  if (_env) return _env;

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('❌ Invalid environment variables:');
    console.error(parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment variables. Check server logs for details.');
  }

  _env = parsed.data;
  return _env;
}

// Client-safe env subset (only NEXT_PUBLIC_ vars)
export const clientEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  metaAppId: process.env.NEXT_PUBLIC_META_APP_ID!,
  metaConfigId: process.env.NEXT_PUBLIC_META_CONFIG_ID!,
  appUrl: process.env.NEXT_PUBLIC_APP_URL!,
};
