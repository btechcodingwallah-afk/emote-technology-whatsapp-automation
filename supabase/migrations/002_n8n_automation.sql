-- ============================================
-- Migration 002: Conversations & n8n Automation
-- ============================================

-- CONVERSATIONS
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES meta_connections(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  auto_reply_count INTEGER NOT NULL DEFAULT 0,
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, connection_id, customer_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer_phone ON conversations(customer_phone);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- CONVERSATION MESSAGES
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  direction TEXT NOT NULL DEFAULT 'inbound', -- 'inbound' | 'outbound'
  message_type TEXT NOT NULL DEFAULT 'text',
  content TEXT,
  meta_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_messages_conv_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_tenant_id ON conversation_messages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conv_messages_meta_id ON conversation_messages(meta_message_id);

-- TENANT AUTOMATION CONFIGS
CREATE TABLE IF NOT EXISTS tenant_automation_configs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  mode TEXT NOT NULL DEFAULT 'AUTO',
  welcome_message TEXT DEFAULT 'Hello! How can we help you?',
  human_handoff_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  human_handoff_keywords TEXT[] DEFAULT ARRAY['human', 'agent', 'person', 'help'],
  human_handoff_message TEXT DEFAULT 'Connecting you with a team member.',
  fallback_message TEXT DEFAULT 'Thank you for reaching out. We will get back to you shortly.',
  max_auto_replies_per_conversation INTEGER NOT NULL DEFAULT 50,
  ai_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_automation_configs_tenant_id ON tenant_automation_configs(tenant_id);

-- RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_automation_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on conversations" ON conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on conversation_messages" ON conversation_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on tenant_automation_configs" ON tenant_automation_configs FOR ALL USING (true) WITH CHECK (true);
