import { z } from 'zod';

// --- Onboarding Session ---

export const createOnboardingSessionSchema = z.object({
  connectionType: z.enum(['CLOUD_API', 'COEXISTENCE']),
});

export const completeSignupSchema = z.object({
  sessionId: z.string().uuid(),
  code: z.string().min(1, 'Authorization code is required'),
  eventType: z.string().min(1),
  sessionInfo: z.object({
    phone_number_id: z.string().optional(),
    waba_id: z.string().optional(),
    business_id: z.string().optional(),
    ad_account_ids: z.array(z.string()).optional(),
    page_ids: z.array(z.string()).optional(),
    current_step: z.string().optional(),
  }),
});

// --- Auth ---

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

// --- Tenant ---

export const createTenantSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase letters, numbers, and hyphens'),
  adminEmail: z.string().email('Invalid admin email'),
  adminPassword: z.string().min(8, 'Password must be at least 8 characters'),
  adminName: z.string().min(2, 'Admin name required'),
});

// --- Internal Send Message ---

export const sendMessageSchema = z.object({
  tenantId: z.string().uuid(),
  to: z.string().min(1, 'Recipient phone number required'),
  type: z.enum(['text', 'template']),
  message: z.union([
    z.object({
      body: z.string().min(1),
      preview_url: z.boolean().optional(),
    }),
    z.object({
      template_name: z.string().min(1),
      language_code: z.string().min(2),
      components: z.array(z.record(z.string(), z.unknown())).optional(),
    }),
  ]),
});

// --- Webhook ---

export const webhookVerifySchema = z.object({
  'hub.mode': z.string(),
  'hub.verify_token': z.string(),
  'hub.challenge': z.string(),
});

export type CreateOnboardingSessionInput = z.infer<typeof createOnboardingSessionSchema>;
export type CompleteSignupInput = z.infer<typeof completeSignupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
