-- Reset Gemini auth mode to api_key (removing OAuth support)
-- This ensures all users are switched back to API key mode for Gemini
UPDATE settings SET gemini_auth_mode = 'api_key' WHERE gemini_auth_mode IN ('oauth_gemini_cli', 'oauth_antigravity');
