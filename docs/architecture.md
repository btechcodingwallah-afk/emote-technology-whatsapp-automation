# Architecture — Emote WhatsApp Automation Platform

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    CLIENT BROWSER                           │
│                                                             │
│  Dashboard UI ←→ Meta FB JS SDK ←→ Meta Embedded Signup v4 │
│       │              │                     │                │
│       │         postMessage            OAuth code           │
│       │         (session info)         (30s TTL)            │
│       └──────────────┴─────────────────────┘                │
└───────────────────────────│──────────────────────────────────┘
                            │ HTTPS
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                EMOTE BACKEND (Next.js)                      │
│                                                             │
│  ┌──────────┐  ┌────────────────┐  ┌──────────────────┐    │
│  │ Auth     │  │ Onboarding     │  │ Webhook          │    │
│  │ (JWT)    │  │ Service        │  │ Service          │    │
│  └──────────┘  └───────┬────────┘  └────────┬─────────┘    │
│                        │                     │              │
│  ┌─────────────────────┴─────────────────────┴──────────┐   │
│  │              Meta Graph API Service                   │   │
│  │  - Token Exchange    - WABA Subscription              │   │
│  │  - Phone Registration - Messaging                     │   │
│  │  - Coexistence Sync  - Connection Verify              │   │
│  └───────────────────────┬───────────────────────────────┘   │
│                          │                                   │
│  ┌──────────────┐  ┌────┴─────────┐  ┌──────────────────┐  │
│  │ Encryption   │  │ Supabase DB  │  │ n8n Client       │  │
│  │ (AES-256-GCM)│  │ (PostgreSQL) │  │ (HMAC signed)    │  │
│  └──────────────┘  └──────────────┘  └────────┬─────────┘  │
└────────────────────────────────────────────────┤────────────┘
                                                 │
                            ┌────────────────────┤
                            ▼                    ▼
                    ┌──────────────┐    ┌──────────────┐
                    │ Meta Graph   │    │ n8n (self-   │
                    │ API          │    │ hosted)      │
                    │ (v21.0)      │    │              │
                    └──────────────┘    └──────────────┘
```

## Multi-Tenant Data Model

```
Tenant (1) ──→ (N) Users
   │
   ├──→ (N) MetaConnections
   │         │
   │         ├──→ (1) TokenCredential (encrypted)
   │         ├──→ (1) WhatsAppBusinessAccount
   │         │         │
   │         │         └──→ (N) WhatsAppPhoneNumbers
   │         │
   │         └──→ (N) OnboardingSessions
   │
   ├──→ (N) WebhookEvents
   ├──→ (N) AutomationEndpoints
   └──→ (N) AuditLogs
```

## Security Architecture

### Token Security
- Meta tokens encrypted at rest with AES-256-GCM (unique IV per token)
- Tokens NEVER returned to frontend, logged, or sent to n8n
- Decryption only happens in MetaGraphService when making API calls

### Tenant Isolation
- Every DB query includes `tenant_id` filter
- Supabase RLS enabled on all tables
- JWT contains `tenantId` — validated on every request
- Webhook routing resolves tenant from `phone_number_id` (not from request body claims)

### Webhook Security
- Meta webhooks verified via X-Hub-Signature-256 (HMAC-SHA256 with app secret)
- Internal n8n webhooks signed with X-Emote-Signature (HMAC-SHA256 with shared secret)
- Duplicate events rejected via `meta_message_id` unique constraint

### Onboarding Security
- Sessions have 15-minute expiry
- Cryptographic nonce prevents replay
- Session bound to specific tenant + user
- Authorization code exchanged server-side only

## Onboarding Flows

### Flow A: Cloud API
```
User → Create Session → FB.login(config_id) → Meta Popup
→ Auth Code (30s TTL) → Exchange for Token → Subscribe WABA
→ Register Phone → Store Encrypted Token → CONNECTED
```

### Flow B: Coexistence
```
User → Create Session → FB.login(config_id, featureType="whatsapp_business_app_onboarding")
→ Meta Popup → Auth Code → Exchange for Token → Subscribe WABA
→ Skip Registration → Sync Contacts → Sync History → SYNCING → CONNECTED
```

## Webhook Flow
```
Meta → POST /api/webhooks/meta/whatsapp
→ Verify X-Hub-Signature-256
→ Parse payload, extract phone_number_id
→ Lookup tenant from whatsapp_phone_numbers table
→ Check for duplicate (meta_message_id)
→ Store WebhookEvent
→ Forward to n8n (with X-Emote-Signature)
→ Return 200
```
