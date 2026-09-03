# Local Meta Testing Guide

Meta Embedded Signup requires HTTPS for all OAuth domains and redirect URIs. This document explains how to test locally.

---

## Option 1: Cloudflare Tunnel (Recommended)

### Install

```bash
brew install cloudflared
```

### Start Tunnel

```bash
# Start your Next.js dev server
npm run dev

# In another terminal, create a tunnel
cloudflared tunnel --url http://localhost:3000
```

This outputs a URL like: `https://random-words.trycloudflare.com`

### Update Meta Dashboard

1. Go to **Facebook Login for Business → Settings**
2. Add to **Allowed Domains**: `https://random-words.trycloudflare.com`
3. Add to **Valid OAuth Redirect URIs**: `https://random-words.trycloudflare.com/api/meta/oauth/callback`

4. Go to **WhatsApp → Getting Started**
5. Update **Callback URL**: `https://random-words.trycloudflare.com/api/webhooks/meta/whatsapp`

### Update .env.local

```env
NEXT_PUBLIC_APP_URL=https://random-words.trycloudflare.com
APP_URL=https://random-words.trycloudflare.com
```

> **Note:** Cloudflare Tunnel generates a new URL each time. Use `cloudflared tunnel create` for a persistent tunnel.

---

## Option 2: ngrok

### Install

```bash
brew install ngrok
```

### Start Tunnel

```bash
npm run dev
ngrok http 3000
```

### Update Meta Dashboard

Same steps as Cloudflare but with ngrok URL.

---

## Testing Checklist

### 1. Webhook Verification

```bash
curl "https://YOUR-TUNNEL.trycloudflare.com/api/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_VERIFY_TOKEN&hub.challenge=test_challenge_123"
```

Expected response: `test_challenge_123`

### 2. Health Check

```bash
curl https://YOUR-TUNNEL.trycloudflare.com/api/health
```

Expected: `{"status":"ok","service":"emote-whatsapp-platform",...}`

### 3. Create Test Tenant

```bash
curl -X POST https://YOUR-TUNNEL.trycloudflare.com/api/tenants \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Mohindra Ed Tech",
    "slug": "mohindra-ed-tech",
    "adminEmail": "admin@mohindraedtech.com",
    "adminPassword": "SecurePassword123!",
    "adminName": "Admin"
  }'
```

### 4. Login

```bash
curl -X POST https://YOUR-TUNNEL.trycloudflare.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@mohindraedtech.com",
    "password": "SecurePassword123!"
  }'
```

Save the returned `token` for subsequent requests.

### 5. Test Embedded Signup

1. Open `https://YOUR-TUNNEL.trycloudflare.com/dashboard/whatsapp` in browser
2. Click "Connect WhatsApp"
3. Complete the Meta Embedded Signup flow
4. Verify connection appears on dashboard

### 6. Test Webhook Delivery

Send a test message to your WhatsApp number and verify:
- Webhook event appears in `webhook_events` table
- Event is forwarded to n8n (if configured)

---

## Common Issues

| Issue | Solution |
|---|---|
| "URL is not allowed" in Meta popup | Add tunnel URL to Allowed Domains in Meta Dashboard |
| Webhook verification fails | Check `META_WEBHOOK_VERIFY_TOKEN` matches dashboard value |
| Token exchange fails | Code TTL is 30s — ensure backend processes it immediately |
| SDK not loading | Check browser console for CSP errors, ensure HTTPS |
| Tunnel URL changed | Update all URLs in Meta Dashboard and `.env.local` |
