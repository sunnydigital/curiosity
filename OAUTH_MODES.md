# OAuth Authentication Modes

This document explains the different OAuth authentication modes available in CuriosityLM and when to use each.

## Overview

CuriosityLM supports multiple OAuth authentication modes for different LLM providers. Each mode is designed for specific use cases and model access patterns.

## Google Gemini - API Key Authentication (Recommended)

**Use this for:** Accessing Gemini models through the public Gemini API

**⚠️ IMPORTANT:** The public Gemini API (`generativelanguage.googleapis.com`) does **NOT** support OAuth authentication. OAuth only works with Vertex AI / Google Cloud endpoints.

**How to use:**
1. Get an API key from https://aistudio.google.com/apikey
2. Go to Settings in the app
3. Select "API Key" as the Gemini Auth Mode
4. Enter your API key
5. This gives you free access to Gemini with 60 requests/min

**Supported models:**
- gemini-2.5-pro
- gemini-2.5-flash
- gemini-2.0-flash
- gemini-1.5-pro
- gemini-1.5-flash
- And other models available through AI Studio

## Other OAuth Modes

### `oauth` - Anthropic OAuth
- For Anthropic Claude models (Claude Pro/Max)
- Uses Anthropic's OAuth flow
- Code-paste authentication

### `oauth_openai_codex` - OpenAI ChatGPT Pro
- For OpenAI models via ChatGPT Plus/Pro subscription
- Uses OpenAI Codex OAuth
- Local callback server on port 1455

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

**Cause:** The public Gemini API does **NOT** support OAuth**. OAuth only works with Vertex AI / Google Cloud endpoints, not the free public API.

**Solution (Recommended):** Use API Key mode
1. Get an API key from https://aistudio.google.com/apikey  
2. Go to Settings in your app
3. Change "Gemini Auth Mode" to "API Key"
4. Enter your API key
5. This gives you free access to Gemini with 60 requests/min

**Alternative:** Use Vertex AI (Enterprise only)
- Requires a billing-enabled Google Cloud project
- Set `GOOGLE_CLOUD_PROJECT` environment variable
- More expensive but has enterprise features

### Issue: OAuth Token Refresh Failed

**Solution:**
- Re-authenticate by disconnecting and reconnecting OAuth in settings
- Check that your account has the necessary permissions
- Verify the OAuth callback server can start on the required port

## Configuration

### In Settings UI
1. Navigate to Settings
2. Find the authentication section for each provider
3. Select the appropriate auth mode
4. Follow the OAuth flow or enter your API key

### In Database
```sql
-- Set Gemini auth mode to API key
UPDATE settings SET gemini_auth_mode = 'api_key' WHERE id = 1;

-- Set Anthropic auth mode to OAuth
UPDATE settings SET anthropic_auth_mode = 'oauth' WHERE id = 1;
```

## Technical Details

### OAuth Flow Comparison

| Feature | Anthropic OAuth | OpenAI Codex | GitHub Copilot |
|---------|-----------------|--------------|----------------|
| Flow Type | Code paste | Local server | Device code |
| Port | N/A | 1455 | N/A |
| Models | Claude | GPT | GPT |
| Source | @mariozechner/pi-ai | @mariozechner/pi-ai | @mariozechner/pi-ai |

## References

- [@mariozechner/pi-ai](https://www.npmjs.com/package/@mariozechner/pi-ai) - OAuth integration library
- [Google AI Studio](https://aistudio.google.com/apikey) - Get Gemini API keys
