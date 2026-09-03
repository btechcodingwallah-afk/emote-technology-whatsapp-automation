# Emote Technology — WhatsApp Automation Platform

Enterprise-grade multi-tenant WhatsApp Business Cloud API & n8n automation platform.

## Architecture

```
WhatsApp User
     │  (sends message)
     ▼
Meta WhatsApp Cloud API
     │  (POST /api/webhooks/meta/whatsapp)
     ▼
Emote Next.js Backend
     │  - Verifies Meta HMAC-SHA256 signature
     │  - Resolves tenant from phone number
     │  - Deduplicates events & tracks conversations in Supabase
     │  - Signs payload with HMAC-SHA256 + timestamp
     ▼
n8n Incoming Router
     │  - Verifies authentication headers
     │  - Validates payload & filters events
     ▼
n8n Automation Engine
     │  - Human handoff keyword detection
     │  - Automated reply generation
     ▼
Emote Backend (/api/internal/whatsapp/send)
     │  - Verifies internal request signature
     │  - Decrypts Meta token via AES-256-GCM
     │  - Dispatches message via Meta Graph API
     ▼
WhatsApp User (receives response)
```

## Features

- **Multi-Tenant WhatsApp Integration**: Embedded signup & cloud API support.
- **Enterprise Security**: Token encryption via AES-256-GCM, HMAC signing, replay protection.
- **n8n Automation Pipeline**: Decoupled automation engine with zero Meta token exposure to n8n.
- **Human Handoff**: Automatic detection of handoff keywords and status switching.
- **Delivery Receipt Filtering**: Safeguards against runaway feedback loops.

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy `.env.example` to `.env.local` and populate the values:

```bash
cp .env.example .env.local
```

### 3. Database Setup

Apply Supabase migrations located in `supabase/migrations/`:
- `001_initial_schema.sql`
- `002_n8n_automation.sql`

### 4. Run Development Server

```bash
npm run dev
```

### 5. Expose Webhook (Local Dev)

```bash
ngrok http 3000
```

Set the Meta WhatsApp webhook callback URL to:
`https://<your-tunnel-url>/api/webhooks/meta/whatsapp`

## Workflows

Import the workflows from `n8n/workflows/` into your n8n instance:
1. `emote-whatsapp-incoming-router.json`
2. `emote-whatsapp-automation-engine.json`

## License

MIT
