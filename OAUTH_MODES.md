# OAuth Authentication Modes

This document explains the different OAuth authentication modes available in CuriosityLM and when to use each.

## Overview

CuriosityLM supports multiple OAuth authentication modes for different LLM providers. Each mode is designed for specific use cases and model access patterns.

## Google OAuth Modes

### `oauth_gemini_cli` - ⚠️ IMPORTANT: Vertex AI Only

**Use this for:** Accessing Gemini models through **Vertex AI** (Google Cloud) with a billing-enabled project

**⚠️ CRITICAL LIMITATION:** The public Gemini API (`generativelanguage.googleapis.com`) does **NOT** support OAuth authentication. OAuth only works with Vertex AI / Google Cloud endpoints.

**How it works:**
- Uses Google OAuth with `cloud-platform` scope
- Authenticates via PKCE flow with local callback server (port 8085)
- **Requires a billing-enabled Google Cloud project with Vertex AI enabled**
- Routes to Vertex AI endpoints, NOT the public Gemini API

**For free/personal use:** Use **API Key mode** instead (get key from https://aistudio.google.com/apikey)

**Supported models:**
- Any Gemini model available through Vertex AI
- Requires proper Google Cloud project setup with billing

**Client credentials:**
- Uses Gemini CLI OAuth client  
- Redirect URI: `http://localhost:8085/oauth2callback`

**Why you might see errors:**
- ❌ "insufficient authentication scopes" = You're trying to use OAuth with the public API (not supported)
- ✅ Solution: Switch to API Key mode or use Vertex AI with a real Google Cloud project

### `oauth_antigravity` - Non-Google Models via Google Cloud

**Use this for:** Accessing non-Google models (primarily Claude) through Google Cloud Code Assist proxy

**How it works:**
- Uses OpenClaw's Google Antigravity OAuth client credentials
- Authenticates via PKCE flow with local callback server (port 51121)
- Routes requests through `cloudcode-pa.googleapis.com` (Cloud Code Assist endpoint)
- Requires additional OAuth scopes: `cclog`, `experimentsandconfigs`
- Uses Google Cloud project `rising-fact-p41fc` (openclaw's default) or auto-discovered project

**Supported models:**
- `claude-opus-4-5-thinking`
- `claude-sonnet-4-5`
- `claude-haiku-4-5`
- Other models available through Google Cloud Code Assist

**⚠️ IMPORTANT:** This mode does **NOT** support standard Gemini models like `gemini-2.5-flash`. Attempting to use Gemini model names with this mode will result in a 404 error.

**Client credentials:**
- Client ID: `1071006060591-tmhssin2h21lcre235vtolojih4g403ep.apps.googleusercontent.com`
- Uses OpenClaw's production credentials
- Redirect URI: `http://localhost:51121/oauth-callback`

## Other OAuth Modes

### `oauth` - Anthropic OAuth
- For Anthropic Claude models
- Uses Anthropic's OAuth flow

### `oauth_openai_codex` - OpenAI ChatGPT Pro
- For OpenAI models via ChatGPT Plus/Pro subscription
- Uses OpenAI Codex OAuth

### `oauth_github_copilot` - GitHub Copilot
- For OpenAI models via GitHub Copilot subscription
- Device code flow

## Common Issues

### Issue: "insufficient authentication scopes" Error

**Symptom:** 
```
Request had insufficient authentication scopes.
ACCESS_TOKEN_SCOPE_INSUFFICIENT
Method: google.ai.generativelanguage.v1beta.GenerativeService.StreamGenerateContent
Service: generativelanguage.googleapis.com
```

**Cause:** You're using `oauth_gemini_cli` or `oauth_antigravity` mode, but the **public Gemini API does NOT support OAuth**. OAuth only works with Vertex AI / Google Cloud endpoints, not the free public API.

**Solution (Recommended):** Use API Key mode instead
1. Get an API key from https://aistudio.google.com/apikey  
2. Go to Settings in your app
3. Change "Gemini Auth Mode" to "API Key"
4. Enter your API key
5. This gives you free access to Gemini with 60 requests/min

**Alternative:** Use Vertex AI (Enterprise only)
- Requires a billing-enabled Google Cloud project
- Set `GOOGLE_CLOUD_PROJECT` environment variable
- More expensive but has enterprise features

### Issue: 404 Error with oauth_gemini_cli

**Symptom:** 
```
Gemini API error (404): 
The requested URL /v1beta/projects/curiositylm-gemini-default/locations/us-central1/models/gemini-2.5-flash:streamGenerateContent was not found
```

**Cause:** The code was incorrectly routing oauth_gemini_cli requests to the Cloud Code Assist endpoint instead of the public Gemini API.

**Solution:** This has been fixed. The oauth_gemini_cli mode now correctly uses `generativelanguage.googleapis.com` (public API) instead of `cloudcode-pa.googleapis.com` (Cloud Code Assist). No action needed - just restart your app.

### Issue: 404 Error with Antigravity OAuth

**Symptom:** 
```
Gemini API error (404): 
The requested URL /v1beta/projects/rising-fact-p41fc/locations/us-central1/models/gemini-3-pro-preview:streamGenerateContent was not found
```

**Cause:** You're using `oauth_antigravity` mode with a Gemini model name

**Solution:**
1. **Option A (Recommended):** Switch to `oauth_gemini_cli` mode to use Gemini models:
   - Go to Settings
   - Change Gemini Auth Mode to "OAuth Gemini CLI"
   - Re-authenticate if needed
   - Keep using your Gemini models

2. **Option B:** If you specifically want to use Antigravity to access Claude:
   - Change your active model to a Claude model (e.g., `claude-sonnet-4-5`)
   - Keep `oauth_antigravity` mode
   - Note: You'll be accessing Claude through Google Cloud, not Gemini

### Issue: OAuth Token Refresh Failed

**Solution:**
- Re-authenticate by disconnecting and reconnecting OAuth in settings
- Check that your Google account has the necessary permissions
- Verify the OAuth callback server can start on the required port

## Configuration

### In Settings UI
1. Navigate to Settings
2. Find the "Gemini Auth Mode" dropdown
3. Select either:
   - "OAuth Gemini CLI" for Gemini models
   - "OAuth Antigravity" for Claude/other models via Google Cloud

### In Database
```sql
-- Set Gemini auth mode to oauth_gemini_cli
UPDATE settings SET gemini_auth_mode = 'oauth_gemini_cli' WHERE id = 1;

-- Or set to oauth_antigravity
UPDATE settings SET gemini_auth_mode = 'oauth_antigravity' WHERE id = 1;
```

## Technical Details

### OAuth Flow Comparison

| Feature | oauth_gemini_cli | oauth_antigravity |
|---------|------------------|-------------------|
| Port | 8085 | 51121 |
| Endpoint | generativelanguage.googleapis.com | cloudcode-pa.googleapis.com |
| Models | Gemini models | Claude and other non-Google models |
| Default Project | curiositylm-gemini-default | rising-fact-p41fc |
| Extra Scopes | None | cclog, experimentsandconfigs |
| Source | Custom implementation | OpenClaw |

### API Endpoint Construction

**oauth_gemini_cli (Standard Gemini models):**
```
https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent
```
Note: Uses Bearer token authentication, no project routing required.

**oauth_antigravity (Claude/non-Google models via Google Cloud):**
```
https://cloudcode-pa.googleapis.com/v1beta/projects/{projectId}/locations/us-central1/models/{model}:streamGenerateContent
```
Note: Requires project ID routing to access models through Cloud Code Assist proxy.

## References

- [OpenClaw Repository](https://github.com/openclaw-io/openclaw) - Source of Antigravity implementation
- [Google Cloud Code Assist](https://cloud.google.com/code/docs/code-assist) - Official documentation
- [@mariozechner/pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) - OAuth integration library
