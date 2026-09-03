# n8n Integration Setup Guide

Complete reference for integrating the Emote WhatsApp Platform with a self-hosted n8n instance.

---

## 1. Workflow Names

| # | Name | Purpose |
|---|---|---|
| 1 | **EMOTE — WhatsApp Incoming Message Router** | Receives validated webhook events from Emote, verifies HMAC signature + timestamp, validates payload, fetches tenant automation config, routes to Automation Engine |
| 2 | **EMOTE — WhatsApp Automation Engine** | Processes incoming messages, detects human handoff keywords, generates configurable automated response, sends reply via Emote internal API |

---

## 2. Webhook URLs

### n8n Webhook (Emote → n8n)

| Property | Value |
|---|---|
| **Full URL** | `{N8N_BASE_URL}/webhook/emote/whatsapp/incoming` |
| **Example** | `https://n8n.emotetechnology.in/webhook/emote/whatsapp/incoming` |
| **Method** | `POST` |
| **Content-Type** | `application/json` |
| **Trigger** | Emote backend calls this after receiving + validating a Meta webhook |

> **Important:** The URL is determined by `N8N_BASE_URL` (Emote env) + webhook path configured in the n8n workflow trigger node. Do NOT hardcode the URL.

### Emote Internal APIs (n8n → Emote)

| Endpoint | Method | Purpose |
|---|---|---|
| `{EMOTE_API_URL}/api/internal/whatsapp/send` | `POST` | Send WhatsApp message via Emote (n8n never calls Meta directly) |
| `{EMOTE_API_URL}/api/internal/automation/config` | `GET` | Fetch tenant automation configuration |
| `{EMOTE_API_URL}/api/internal/conversations/context` | `GET` | Get conversation history + state |
| `{EMOTE_API_URL}/api/internal/conversations/context` | `POST` | Update conversation state (e.g., HUMAN_HANDOFF) |
| `{EMOTE_API_URL}/api/health/n8n` | `GET` | Verify n8n reachability from Emote |

---

## 3. Authentication Method

### Emote → n8n (Incoming webhook)

**HMAC-SHA256 with timestamp-based replay protection.**

Headers sent by Emote:

```
X-Emote-Signature: <hmac-sha256-hex>
X-Emote-Timestamp: <iso-8601-timestamp>
X-Emote-Tenant-Id: <tenant-uuid>
X-Emote-Event-Type: <event-type>
X-Emote-Event-Id: <event-uuid>
```

Signature computation:

```
signatureInput = timestamp + "." + JSON.stringify(payload)
signature = HMAC-SHA256(signatureInput, N8N_WEBHOOK_SECRET).hex()
```

Replay protection: Reject if `|now - timestamp| > 5 minutes`.

### n8n → Emote (Internal API calls)

Same mechanism. n8n computes the signature before calling Emote:

```javascript
const crypto = require('crypto');
const timestamp = new Date().toISOString();
const body = JSON.stringify(requestBody);
const signatureInput = `${timestamp}.${body}`;
const signature = crypto.createHmac('sha256', N8N_WEBHOOK_SECRET).update(signatureInput).digest('hex');

// Send headers:
// X-Emote-Signature: <signature>
// X-Emote-Timestamp: <timestamp>
```

---

## 4. Expected Payload (Emote → n8n)

```json
{
  "eventId": "550e8400-e29b-41d4-a716-446655440000",
  "tenantId": "tenant-uuid",
  "connectionId": "connection-uuid",
  "wabaId": "123456789",
  "phoneNumberId": "987654321",
  "connectionType": "CLOUD_API",
  "customerPhone": "919876543210",
  "businessPhone": "+91 98765 43210",
  "contact": {
    "name": "Customer Name"
  },
  "messageId": "wamid.ABCDEFxxxxxxx",
  "messageType": "text",
  "text": "Hello",
  "caption": null,
  "mediaId": null,
  "location": null,
  "eventCategory": "message",
  "eventType": "message.text",
  "timestamp": "1693656000",
  "receivedAt": "2026-09-02T14:00:00.000Z",
  "metadata": {
    "entryId": "123456789",
    "conversationId": "conv-uuid",
    "conversationStatus": "ACTIVE",
    "autoReplyCount": 0
  }
}
```

### Message Types

| messageType | Fields populated |
|---|---|
| `text` | `text` |
| `image` | `mediaId`, `caption` (optional) |
| `video` | `mediaId`, `caption` (optional) |
| `audio` | `mediaId` |
| `document` | `mediaId`, `caption` (optional) |
| `location` | `location.latitude`, `location.longitude`, `location.name`, `location.address` |
| `interactive` | `text` (extracted from interactive payload) |

### Event Categories

| Category | When |
|---|---|
| `message` | Customer sent a message (forwarded to n8n) |
| `status` | Delivery receipt / read receipt (NOT forwarded to n8n by default) |
| `system` | System events (NOT forwarded to n8n by default) |

---

## 5. Response Format (n8n → Emote Send API)

### Request

```json
{
  "tenantId": "tenant-uuid",
  "connectionId": "connection-uuid",
  "to": "919876543210",
  "type": "text",
  "message": {
    "type": "text",
    "text": {
      "body": "Hello! How can we help you?"
    }
  }
}
```

### Response (Success)

```json
{
  "success": true,
  "messageId": "wamid.ABCDEFxxxxxxx",
  "phoneNumberId": "987654321"
}
```

### Response (Error)

```json
{
  "success": false,
  "error": "No active WhatsApp connection for this tenant",
  "code": "NO_ACTIVE_CONNECTION",
  "retryable": false
}
```

### Error Codes

| Code | Retryable | Meaning |
|---|---|---|
| `TENANT_NOT_FOUND` | No | Tenant does not exist |
| `TENANT_INACTIVE` | No | Tenant is deactivated |
| `NO_ACTIVE_CONNECTION` | No | No active WhatsApp connection |
| `NO_PHONE_NUMBER` | No | No registered phone number |
| `TOKEN_EXPIRED` | No | Meta token expired, needs reconnection |
| `INVALID_MESSAGE_TYPE` | No | Unsupported message type |
| `META_131047` | No | Meta: Invalid phone number |
| `META_429` | **Yes** | Meta: Rate limited |
| `META_500` | **Yes** | Meta: Server error |
| `INTERNAL_ERROR` | No | Unexpected server error |

---

## 6. Environment Variables

### Emote Backend (.env.local)

```env
# n8n base URL (no trailing slash)
N8N_BASE_URL=https://n8n.emotetechnology.in

# Webhook path in n8n (must match workflow trigger config)
N8N_WEBHOOK_PATH=/webhook/emote/whatsapp/incoming

# Shared HMAC secret (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
N8N_WEBHOOK_SECRET=<64-char-hex-string>
```

### n8n Instance

```env
# MUST be identical to Emote's N8N_WEBHOOK_SECRET
N8N_WEBHOOK_SECRET=<same-64-char-hex-string>

# Emote backend URL (how n8n reaches Emote)
EMOTE_API_URL=https://emotetechnology.in
```

---

## 7. How Emote Backend Calls n8n

```
Meta WhatsApp → POST /api/webhooks/meta/whatsapp (Emote)
    │
    ├── Verify X-Hub-Signature-256 (Meta's HMAC)
    ├── Parse webhook payload
    ├── Resolve tenant from phone_number_id
    ├── Deduplicate via meta_message_id
    ├── Store webhook_event
    ├── Track/create conversation
    ├── Build N8nIncomingEvent (enriched, normalized)
    │
    ├── POST {N8N_BASE_URL}{N8N_WEBHOOK_PATH} (fire-and-forget)
    │     Headers:
    │       X-Emote-Signature: <hmac>
    │       X-Emote-Timestamp: <iso-8601>
    │       X-Emote-Tenant-Id: <tenant-id>
    │       X-Emote-Event-Type: <event-type>
    │       X-Emote-Event-Id: <event-id>
    │     Body: N8nIncomingEvent JSON
    │
    └── Return 200 to Meta (immediately, don't block)
```

---

## 8. How n8n Calls Emote Backend

```
n8n Automation Engine
    │
    ├── Build send request with tenantId + connectionId
    ├── Compute HMAC signature
    │
    ├── POST {EMOTE_API_URL}/api/internal/whatsapp/send
    │     Headers:
    │       X-Emote-Signature: <hmac>
    │       X-Emote-Timestamp: <iso-8601>
    │     Body: { tenantId, connectionId, to, type, message }
    │
    └── Emote backend:
          ├── Verify HMAC + timestamp
          ├── Validate tenant is active
          ├── Load connection (tenant-owned)
          ├── Derive phoneNumberId (server-side, not from n8n)
          ├── Decrypt Meta token
          ├── Call Meta Graph API
          ├── Store in conversation history
          ├── Audit log
          └── Return { success, messageId }
```

---

## 9. Error Handling

### n8n Workflow Error Branches

| Error | n8n Behavior |
|---|---|
| Invalid HMAC signature | Reject with 401, do not process |
| Stale timestamp (>5 min) | Reject with 401, do not process |
| Missing required fields | Reject with 400, do not process |
| Non-message event | Return 200, ignore silently |
| Automation disabled | Return 200, skip processing |
| Conversation in HUMAN_HANDOFF | Return 200, skip auto-reply |
| Auto-reply limit reached | Return 200, skip processing |
| Emote Send API returns error | Log error with tenant context, do not retry permanent errors |
| Rate limit (429) | Retryable — n8n can retry with backoff |
| Network timeout | Log and retry (max 2 retries) |

### What is NEVER logged

- Meta access tokens
- App secrets
- N8N_WEBHOOK_SECRET
- Passwords
- Encryption keys

---

## 10. Testing Instructions

### Prerequisites

1. Emote backend running (`npm run dev`)
2. n8n instance running
3. HTTPS tunnel for local dev (Cloudflare Tunnel or ngrok)
4. Both Emote and n8n using the same `N8N_WEBHOOK_SECRET`
5. At least one tenant with an active WhatsApp connection

### Test 1: Verify n8n Reachability

```bash
curl http://localhost:3000/api/health/n8n
# Expected: {"status":"healthy","latencyMs":...}
```

### Test 2: Simulate Emote → n8n Webhook

```bash
# Generate signature
SECRET="your-n8n-webhook-secret"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
PAYLOAD='{"eventId":"test-001","tenantId":"tenant-uuid","connectionId":"conn-uuid","wabaId":"123","phoneNumberId":"456","connectionType":"CLOUD_API","customerPhone":"919876543210","businessPhone":"+91 98765 43210","contact":{"name":"Test User"},"messageId":"wamid.test001","messageType":"text","text":"Hello","eventCategory":"message","eventType":"message.text","timestamp":"1693656000","receivedAt":"2026-09-02T14:00:00.000Z","metadata":{}}'

SIGNATURE=$(echo -n "${TIMESTAMP}.${PAYLOAD}" | openssl dgst -sha256 -hmac "${SECRET}" | awk '{print $2}')

curl -X POST http://localhost:5678/webhook/emote/whatsapp/incoming \
  -H "Content-Type: application/json" \
  -H "X-Emote-Signature: ${SIGNATURE}" \
  -H "X-Emote-Timestamp: ${TIMESTAMP}" \
  -H "X-Emote-Tenant-Id: tenant-uuid" \
  -H "X-Emote-Event-Type: message.text" \
  -d "${PAYLOAD}"
```

### Test 3: Multi-Tenant Isolation

1. Create Tenant A (e.g., "Mohindra Ed Tech") and Tenant B (e.g., "Test Business")
2. Send a test webhook with Tenant A's `tenantId`
3. Verify n8n processes it and calls Emote Send API with Tenant A's `tenantId`
4. Send a test webhook with Tenant B's `tenantId`
5. Verify n8n uses Tenant B's `tenantId` — never cross-contaminating

### Test 4: Human Handoff

1. Send a message containing "I want to speak to a person"
2. Verify n8n detects the handoff keyword
3. Verify conversation status is updated to `HUMAN_HANDOFF`
4. Verify the handoff message is sent
5. Send another message — verify auto-reply is skipped

### Test 5: End-to-End (Mohindra Ed Tech)

1. Complete Embedded Signup for Mohindra Ed Tech
2. Send a WhatsApp message to the connected number
3. Verify the full flow:
   - Meta webhook → Emote → tenant resolution → n8n → automation → Emote Send API → Meta → customer reply

---

## 11. Production Deployment

### Checklist

- [ ] n8n instance running with TLS (HTTPS)
- [ ] `N8N_WEBHOOK_SECRET` set in both Emote and n8n (identical value)
- [ ] `EMOTE_API_URL` set in n8n to production Emote URL
- [ ] `N8N_BASE_URL` set in Emote to production n8n URL
- [ ] Both workflows imported and activated
- [ ] Automation Engine workflow ID linked in Incoming Router
- [ ] Webhook endpoint accessible from Emote backend
- [ ] n8n execution log retention configured
- [ ] Error notifications configured in n8n (email/Slack)

### Security Checklist

- [ ] n8n webhook NOT publicly accessible without HMAC
- [ ] n8n admin panel behind authentication
- [ ] No Meta tokens in n8n environment or credentials
- [ ] TLS between Emote and n8n
- [ ] `N8N_WEBHOOK_SECRET` is at least 32 bytes of random entropy
- [ ] n8n execution logs do NOT contain tokens

---

## 12. Architecture Diagram

```
                       META
                        │
                        │ WhatsApp Webhook (X-Hub-Signature-256)
                        ▼
            ┌─────────────────────┐
            │   EMOTE BACKEND     │
            │                     │
            │ ✓ Signature verify  │
            │ ✓ Tenant resolution │
            │ ✓ Idempotency       │
            │ ✓ Conversation track│
            │ ✓ Event normalize   │
            │ ✓ Credential vault  │
            └──────────┬──────────┘
                       │
                       │ HMAC + Timestamp signed
                       │ POST /webhook/emote/whatsapp/incoming
                       ▼
            ┌─────────────────────┐
            │   N8N               │
            │                     │
            │ Incoming Router     │
            │   ✓ Verify HMAC     │
            │   ✓ Validate fields │
            │   ✓ Filter events   │
            │   ✓ Fetch config    │
            │        ↓            │
            │ Automation Engine   │
            │   ✓ Handoff detect  │
            │   ✓ Generate reply  │
            │   ✓ [AI Agent slot] │
            └──────────┬──────────┘
                       │
                       │ HMAC + Timestamp signed
                       │ POST /api/internal/whatsapp/send
                       ▼
            ┌─────────────────────┐
            │   EMOTE BACKEND     │
            │                     │
            │ ✓ Verify signature  │
            │ ✓ Validate tenant   │
            │ ✓ Load connection   │
            │ ✓ Decrypt token     │
            │ ✓ Call Meta API     │
            │ ✓ Audit log         │
            └──────────┬──────────┘
                       │
                       │ Meta Graph API (with decrypted token)
                       ▼
                     META
                       │
                       ▼
                 WhatsApp User
```
