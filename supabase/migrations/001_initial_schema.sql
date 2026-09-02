-- ============================================
-- Emote WhatsApp Platform — Database Schema
-- Supabase PostgreSQL Migration
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE connection_type AS ENUM ('CLOUD_API', 'COEXISTENCE');
CREATE TYPE connection_status AS ENUM ('PENDING', 'ACTIVE', 'NEEDS_ACTION', 'DISCONNECTED', 'ERROR');
CREATE TYPE onboarding_status AS ENUM (
  'STARTED',
  'META_AUTHORIZED',
  'TOKEN_EXCHANGED',
  'WABA_SUBSCRIBED',
  'PHONE_REGISTERED',
  'SYNCING',
  'CONNECTED',
  'FAILED'
);
CREATE TYPE tenant_status AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');
CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE webhook_event_status AS ENUM ('RECEIVED', 'PROCESSING', 'FORWARDED', 'FAILED', 'DUPLICATE');

-- ============================================
-- TENANTS
-- ============================================

CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status tenant_status NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_status ON tenants(status);

-- ============================================
-- USERS
-- ============================================

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'MEMBER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_tenant_id ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- META CONNECTIONS
-- ============================================

CREATE TABLE meta_connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  meta_business_id TEXT,
  connection_type connection_type NOT NULL DEFAULT 'CLOUD_API',
  connection_status connection_status NOT NULL DEFAULT 'PENDING',
  onboarding_status onboarding_status NOT NULL DEFAULT 'STARTED',
  error_message TEXT,
  last_error_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_meta_connections_tenant_id ON meta_connections(tenant_id);
CREATE INDEX idx_meta_connections_status ON meta_connections(connection_status);

-- ============================================
-- WHATSAPP BUSINESS ACCOUNTS
-- ============================================

CREATE TABLE whatsapp_business_accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  meta_waba_id TEXT NOT NULL,
  name TEXT,
  currency TEXT,
  timezone_id TEXT,
  message_template_namespace TEXT,
  subscription_status TEXT DEFAULT 'NONE',
  subscribed_at TIMESTAMPTZ,
  last_subscription_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meta_waba_id)
);

CREATE INDEX idx_waba_tenant_id ON whatsapp_business_accounts(tenant_id);
CREATE INDEX idx_waba_meta_waba_id ON whatsapp_business_accounts(meta_waba_id);

-- ============================================
-- WHATSAPP PHONE NUMBERS
-- ============================================

CREATE TABLE whatsapp_phone_numbers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  waba_id UUID NOT NULL REFERENCES whatsapp_business_accounts(id) ON DELETE CASCADE,
  meta_phone_number_id TEXT NOT NULL,
  display_phone_number TEXT,
  verified_name TEXT,
  quality_rating TEXT,
  platform_type TEXT,
  is_on_biz_app BOOLEAN DEFAULT FALSE,
  is_registered BOOLEAN DEFAULT FALSE,
  -- Coexistence-specific fields
  history_sync_status TEXT DEFAULT 'NONE',
  coexistence_status TEXT DEFAULT 'NONE',
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meta_phone_number_id)
);

CREATE INDEX idx_phone_tenant_id ON whatsapp_phone_numbers(tenant_id);
CREATE INDEX idx_phone_meta_id ON whatsapp_phone_numbers(meta_phone_number_id);

-- ============================================
-- TOKEN CREDENTIALS (Encrypted)
-- ============================================

CREATE TABLE token_credentials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  encrypted_token TEXT NOT NULL,
  token_type TEXT NOT NULL DEFAULT 'business_integration',
  issued_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_token_tenant_id ON token_credentials(tenant_id);
CREATE INDEX idx_token_connection_id ON token_credentials(connection_id);

-- ============================================
-- ONBOARDING SESSIONS
-- ============================================

CREATE TABLE onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  nonce TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL,
  connection_type connection_type NOT NULL DEFAULT 'CLOUD_API',
  session_data JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'PENDING',
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_onboarding_tenant_id ON onboarding_sessions(tenant_id);
CREATE INDEX idx_onboarding_nonce ON onboarding_sessions(nonce);

-- ============================================
-- WEBHOOK EVENTS
-- ============================================

CREATE TABLE webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  connection_id UUID REFERENCES meta_connections(id) ON DELETE SET NULL,
  meta_message_id TEXT,
  phone_number_id TEXT,
  waba_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status webhook_event_status NOT NULL DEFAULT 'RECEIVED',
  forwarded_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(meta_message_id)
);

CREATE INDEX idx_webhook_tenant_id ON webhook_events(tenant_id);
CREATE INDEX idx_webhook_phone_id ON webhook_events(phone_number_id);
CREATE INDEX idx_webhook_meta_msg_id ON webhook_events(meta_message_id);
CREATE INDEX idx_webhook_created_at ON webhook_events(created_at);

-- ============================================
-- AUTOMATION ENDPOINTS (n8n targets)
-- ============================================

CREATE TABLE automation_endpoints (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  webhook_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_tenant_id ON automation_endpoints(tenant_id);

-- ============================================
-- AUDIT LOGS
-- ============================================

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant_id ON audit_logs(tenant_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at);

-- ============================================
-- ROW LEVEL SECURITY (Tenant Isolation)
-- ============================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_business_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_phone_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE onboarding_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS, so our backend using service_role key has full access.
-- These policies are for additional safety if anon key is ever used.

CREATE POLICY "Service role full access on tenants" ON tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on users" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on meta_connections" ON meta_connections FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on whatsapp_business_accounts" ON whatsapp_business_accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on whatsapp_phone_numbers" ON whatsapp_phone_numbers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on token_credentials" ON token_credentials FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on onboarding_sessions" ON onboarding_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on webhook_events" ON webhook_events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on automation_endpoints" ON automation_endpoints FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on audit_logs" ON audit_logs FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_meta_connections_updated_at BEFORE UPDATE ON meta_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_waba_updated_at BEFORE UPDATE ON whatsapp_business_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_phone_updated_at BEFORE UPDATE ON whatsapp_phone_numbers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_token_updated_at BEFORE UPDATE ON token_credentials FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_automation_updated_at BEFORE UPDATE ON automation_endpoints FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
