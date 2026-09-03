# Meta App Dashboard Setup Guide

This document tells you exactly what to configure in the Meta App Dashboard for Emote Automation to work with Embedded Signup v4.

## Prerequisites

- [x] Meta Business Verification completed
- [x] Meta Access Verification as Tech Provider completed
- [ ] App Review for Advanced Access submitted and approved

---

## 1. App Settings → Basic

**Location:** App Dashboard → Settings → Basic

| Field | Value |
|---|---|
| App ID | Copy this — use as `META_APP_ID` and `NEXT_PUBLIC_META_APP_ID` |
| App Secret | Copy this — use as `META_APP_SECRET` (NEVER share publicly) |
| App Domains | `emotetechnology.in` |
| Privacy Policy URL | `https://emotetechnology.in/privacy` |
| Terms of Service URL | `https://emotetechnology.in/terms` |

---

## 2. Add Required Products

**Location:** App Dashboard → Add Product

Add these products:
1. **Facebook Login for Business**
2. **WhatsApp** (WhatsApp Business Platform)

---

## 3. Facebook Login for Business → Settings

**Location:** App Dashboard → Facebook Login for Business → Settings → Client OAuth settings

| Setting | Value |
|---|---|
| Client OAuth login | **Yes** |
| Web OAuth login | **Yes** |
| Enforce HTTPS | **Yes** |
| Embedded Browser OAuth Login | **Yes** |
| Use Strict Mode for redirect URIs | **Yes** |
| Allowed Domains | `https://emotetechnology.in` |
| Valid OAuth Redirect URIs | `https://emotetechnology.in/api/meta/oauth/callback` |

> **For local development**, also add your tunnel URL:
> - Allowed Domains: `https://your-tunnel.trycloudflare.com`
> - Valid OAuth Redirect URIs: `https://your-tunnel.trycloudflare.com/api/meta/oauth/callback`

---

## 4. Facebook Login for Business → Configurations

**Location:** App Dashboard → Facebook Login for Business → Configurations

### Create Configuration:

1. Click **"Create configuration"** (or "Create from template")
2. Select template: **"WhatsApp Embedded Signup Configuration With 60 Expiration Token"**
3. Configure:

| Field | Value |
|---|---|
| Configuration name | `Emote WhatsApp Onboarding` |
| Login variation | `WhatsApp Embedded Signup` |
| Token type | `Business Integration System User Access Token (60 day expiry)` |
| Products | Select: **Cloud API** |
| Permissions | `whatsapp_business_management`, `whatsapp_business_messaging` |
| Assets | WhatsApp Business Accounts |

4. Copy the **Configuration ID** → use as `NEXT_PUBLIC_META_CONFIG_ID`

### For Coexistence (if using separate config):

Create a second configuration with the same settings. The frontend will pass `featureType: "whatsapp_business_app_onboarding"` at runtime to enable Coexistence mode.

---

## 5. WhatsApp → Getting Started

**Location:** App Dashboard → WhatsApp → Getting Started

### Webhook Configuration:

| Field | Value |
|---|---|
| Callback URL | `https://emotetechnology.in/api/webhooks/meta/whatsapp` |
| Verify token | Your `META_WEBHOOK_VERIFY_TOKEN` value from `.env` |

### Webhook Fields to Subscribe:

| Field | Required For |
|---|---|
| `messages` | All (inbound messages, delivery receipts) |
| `account_update` | All (WABA status changes) |

### Additional Fields for Coexistence:

| Field | Required For |
|---|---|
| `history` | Coexistence (WhatsApp Business App historical messages) |
| `smb_app_state_sync` | Coexistence (contact sync from mobile app) |
| `smb_message_echoes` | Coexistence (messages sent from mobile app) |

---

## 6. App Review

**Location:** App Dashboard → App Review → Permissions and Features

Submit for Advanced Access:

| Permission | Description |
|---|---|
| `whatsapp_business_management` | Manage WhatsApp Business Accounts |
| `whatsapp_business_messaging` | Send and receive WhatsApp messages |

**Note:** While in Development Mode, your app admins/developers can test the full flow. Production users require App Review approval.

---

## 7. App Mode

**Location:** App Dashboard → Settings → Basic

| Mode | When to Use |
|---|---|
| **Development** | Testing with app admins/developers only |
| **Live** | Production — requires App Review approval |

To switch to Live:
1. Complete all App Review submissions
2. Ensure Privacy Policy URL is set
3. Toggle App Mode to **Live**

---

## 8. Environment Variables Summary

After completing dashboard setup, your `.env.local` should contain:

```env
NEXT_PUBLIC_META_APP_ID=<from App Settings → Basic>
NEXT_PUBLIC_META_CONFIG_ID=<from Facebook Login for Business → Configurations>
META_APP_ID=<same as NEXT_PUBLIC_META_APP_ID>
META_APP_SECRET=<from App Settings → Basic — KEEP SECRET>
META_GRAPH_API_VERSION=v21.0
META_WEBHOOK_VERIFY_TOKEN=<your chosen verify token>
```

---

## 9. Verification Checklist

After configuration, verify:

- [ ] Visiting `https://emotetechnology.in/api/webhooks/meta/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=test123` returns `test123`
- [ ] Clicking "Connect WhatsApp" on the dashboard opens Meta's Embedded Signup popup
- [ ] The popup shows your app name "Emote Automation"
- [ ] After completing signup, the authorization code is returned to your callback
- [ ] Token exchange succeeds (check server logs)
- [ ] WABA subscription succeeds
- [ ] Webhook events are received when a test message is sent
