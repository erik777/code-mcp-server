**Mode 2 OAuth Debugging Guide for Cursor**

This guide documents the current status, recent success milestones, and targeted next steps for debugging the Simple + OAuth (Mode 2) integration for ChatGPT Deep Research compatibility.

---

## ✅ Current Progress Summary

| Stage                           | Status                  |
| ------------------------------- | ----------------------- |
| OAuth discovery (`.well-known`) | ✅ OK                    |
| Client registration             | ✅ OK                    |
| Login redirect flow             | ✅ OK                    |
| Authorization code issued       | ✅ OK                    |
| Callback reached                | ✅ OK                    |
| Token exchange triggered        | ✅ OK                    |
| Token exchange success          | ❌ FAIL — invalid\_grant |

---

## ❌ Problem in Focus

The final step — exchanging the authorization code for an access token — fails with:

```json
{"error":"invalid_grant","error_description":"Invalid grant type or code"}
```

This error typically means:

* The `code` is missing, expired, or was already used
* The `grant_type` is incorrect (should be `authorization_code`)
* The `client_id`, `client_secret`, or `redirect_uri` does not match the original login request

---

## 🔍 What Cursor Should Investigate

### 1. Log the Full Token Exchange Input

At the point `/oauth/callback` is triggered:

* ✅ Log the `POST` body received (redact `client_secret` if needed)
* ✅ Log the full payload being sent to the token endpoint

### 2. Verify Consistency With Login Flow

Ensure the following are **exactly the same** between login and callback:

* `client_id`
* `client_secret`
* `grant_type` = `authorization_code`
* `redirect_uri` = `https://chatgpt.com/connector_platform_oauth_redirect`
* `code` matches what Hydra issued earlier

### 3. Check Hydra Logs

Hydra may be logging:

* Code expiration or misuse
* Missing/invalid parameters
* Unregistered clients (if registration wasn’t persisted)

---

## 🧪 Manual Testing (Optional)

If needed, retry the token exchange manually with `curl`:

```bash
curl -X POST https://www.servicecraze.com/corsair/mcp1/oauth/callback \
  -d grant_type=authorization_code \
  -d code=RECEIVED_CODE_HERE \
  -d client_id=... \
  -d client_secret=... \
  -d redirect_uri=https://chatgpt.com/connector_platform_oauth_redirect
```

---

## ✅ Recap

This log confirms that Mode 2 is fully functional **up to the final exchange**. Once the token exchange succeeds:

* ChatGPT will treat the connector as authenticated
* Deep Research can analyze protected content securely

---

## 🎯 Primary Next Step

Focus all diagnostic effort on the `/oauth/callback` handler — log every param, response, and forward target involved in the exchange.

Once resolved, we will have succeeded in enabling Deep Research with OAuth-protected access (Mode 2).

---

This doc will serve as the central reference for Cursor when debugging or enhancing Mode 2 going forward.
