# 🌝 Code MCP Server + Hydra Integration Guide

This document outlines how to integrate and test the standalone **code-mcp-server** with **Hydra** for OAuth 2.0 authentication, enabling secure use from within ChatGPT.

---

## 📦 Components & Setup

### 1. **code-mcp-server**

* Port: `3131`
* Accessible via: `https://www.servicecraze.com/corsair/mcp1`
* MCP endpoint: `/mcp`
* OAuth callback: `/oauth/callback`
* Hydra login handler: `/hydra/login`
* Hydra consent handler: `/hydra/consent`
* Metadata: `/.well-known/oauth-authorization-server`

#### Environment Variables

Add these to `.env.local` or export them in your shell:

```env
# Public base URL
PUBLIC_URL=https://www.servicecraze.com/corsair/mcp1

# OAuth settings for Hydra
OAUTH_CLIENT_ID=mcp-client
OAUTH_CLIENT_SECRET=mcp-secret
OAUTH_REDIRECT_URI=https://www.servicecraze.com/corsair/mcp1/oauth/callback

# Hydra endpoints
HYDRA_ADMIN_URL=http://localhost:4445
HYDRA_PUBLIC_URL=http://localhost:4444
```

> You must register the MCP client with Hydra using the Admin API:
>
> ```bash
> curl -X POST http://localhost:4445/clients \
>   -H "Content-Type: application/json" \
>   -d '{
>     "client_id": "mcp-client",
>     "client_secret": "mcp-secret",
>     "grant_types": ["authorization_code"],
>     "response_types": ["code"],
>     "scope": "openid profile email",
>     "redirect_uris": ["https://www.servicecraze.com/corsair/mcp1/oauth/callback"],
>     "token_endpoint_auth_method": "client_secret_post"
>   }'
> ```

### 2. **Hydra Docker Container**

Hydra uses **two ports**:

* `4444` – **Public API** (used by OAuth clients like ChatGPT)
* `4445` – **Admin API** (used to manage clients like `mcp-client`)

#### Run Hydra (Single-node for Dev/Test)

```bash
docker run --rm \
  -e URLS_SELF_ISSUER=http://localhost:4444 \
  -e URLS_CONSENT=http://localhost:3131/hydra/consent \
  -e URLS_LOGIN=http://localhost:3131/hydra/login \
  -e DSN=memory \
  -p 4444:4444 \
  -p 4445:4445 \
  oryd/hydra:v2.2 \
  serve all --dev
```

> **Browser-accessed Public URLs:**
>
> * `https://www.servicecraze.com/corsair/mcp1/oauth/login` – OAuth login start (user-triggered)
> * `https://www.servicecraze.com/corsair/mcp1/oauth/callback` – OAuth redirect after login
> * `https://www.servicecraze.com/corsair/mcp1/hydra/login` – Hydra login handler (Hydra calls this)
> * `https://www.servicecraze.com/corsair/mcp1/hydra/consent` – Hydra consent handler (Hydra calls this)
> * `https://www.servicecraze.com/corsair/mcp1/mcp` – ChatGPT hits this after OAuth auth
> * `https://www.servicecraze.com/corsair/mcp1/.well-known/oauth-authorization-server` – For metadata discovery

> **Internal Service URLs (reverse proxy targets):**
>
> * `http://localhost:3131/oauth/login`
> * `http://localhost:3131/oauth/callback`
> * `http://localhost:3131/hydra/login`
> * `http://localhost:3131/hydra/consent`
> * `http://localhost:3131/mcp`
> * `http://localhost:3131/.well-known/oauth-authorization-server`
> * `http://localhost:4444` – Hydra Public API
> * `http://localhost:4445` – Hydra Admin API

You may modify the `URLS_SELF_ISSUER` and handler paths to reflect your reverse-proxied public URLs if required.

---

## 🔗 OAuth2 Endpoints

Hydra must be configured to point to your MCP server:

* Login endpoint: `https://www.servicecraze.com/corsair/mcp1/hydra/login`
* Consent endpoint: `https://www.servicecraze.com/corsair/mcp1/hydra/consent`
* Redirect URI for MCP client: `https://www.servicecraze.com/corsair/mcp1/oauth/callback`

Ensure these match in:

* MCP `.env.local`
* Hydra Docker `-e` parameters
* OAuth metadata response served from: `/.well-known/oauth-authorization-server`

---

## 💪 Integration Testing Steps

### ✅ MCP Server

1. Run `code-mcp-server` locally on port 3131
2. Confirm logs show:

   * `🎉 MCP Git Gateway Server with OAuth started successfully`
   * Endpoints listed (e.g., `/oauth/login`, `/mcp`, `/hydra/login`)

### ✅ Hydra Docker

1. Ensure the container is up:

   ```bash
   docker ps | grep hydra
   ```
2. Use `docker logs <container>` to verify readiness

### 🔪 Test OAuth Metadata

* Access: `https://www.servicecraze.com/corsair/mcp1/.well-known/oauth-authorization-server`
* Should return valid JSON:

```json
{
  "issuer": "http://localhost:4444",
  "authorization_endpoint": "http://localhost:4444/oauth2/auth",
  "token_endpoint": "http://localhost:4444/oauth2/token",
  "userinfo_endpoint": "http://localhost:4444/userinfo",
  "scopes_supported": ["openid", "profile", "email"],
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code"],
  "jwks_uri": "http://localhost:4444/.well-known/jwks.json"
}
```

> Adjust ports or domains if you're using HTTPS behind a reverse proxy.

### 🔪 Test Hydra Flow

1. Open: `https://www.servicecraze.com/corsair/mcp1/oauth/login`
2. Proceed through login flow
3. Complete consent
4. Return to `/mcp`

   * Expect:

```json
{ "error": "Authentication required" }
```

if not logged in, or a working response if authenticated.

---

## 🪩 Next Steps

* [x] MCP running locally on port 3131
* [x] Hydra running via Docker
* [x] Login + Consent endpoints wired to MCP
* [x] `.well-known/oauth-authorization-server` returns valid metadata
* [x] MCP responds with 401 if unauthenticated
* [x] Register `mcp-client` in Hydra via Admin API
* [ ] ChatGPT MCP connector succeeds in dynamic registration
* [ ] Successful login and authenticated `/mcp` access from ChatGPT

---

Let me know if you'd like this exported as a Markdown guide or scriptable CLI onboarding next.
