import { NextResponse } from "next/server";
import { getSettings } from "@/db/queries/settings";
import { getValidAccessToken } from "@/lib/oauth/token-refresh";

/**
 * Fetch available models from Google Antigravity (Cloud Code Assist).
 * Based on openclaw's implementation - Antigravity provides access to non-Google models
 * like Claude through Google Cloud infrastructure.
 */
export async function GET() {
    try {
        const settings = getSettings();

        // Only proceed if using Antigravity OAuth
        if (settings.geminiAuthMode !== "oauth_antigravity") {
            return NextResponse.json({
                models: [],
                error: "Antigravity auth not configured"
            });
        }

        // Get OAuth access token
        let accessToken: string;
        try {
            const tokenData = await getValidAccessToken("gemini");
            // Extract token from JSON if needed
            let parsed: any;
            try {
                parsed = JSON.parse(tokenData);
                accessToken = parsed.token || tokenData;
            } catch {
                accessToken = tokenData;
            }
        } catch (error) {
            return NextResponse.json({
                models: [],
                error: "No valid OAuth token available"
            });
        }

        // Parse projectId from token
        let projectId = "rising-fact-p41fc"; // openclaw's default
        try {
            const parsed = JSON.parse(await getValidAccessToken("gemini"));
            if (parsed.projectId) {
                projectId = parsed.projectId;
            }
        } catch {
            // Use default
        }

        // Fetch available models from Antigravity endpoint
        // Based on openclaw's approach - they use the Cloud Code Assist API
        const CODE_ASSIST_ENDPOINTS = [
            "https://cloudcode-pa.googleapis.com",
            "https://daily-cloudcode-pa.sandbox.googleapis.com",
        ];

        const headers = {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "User-Agent": "google-api-nodejs-client/9.15.1",
            "X-Goog-Api-Client": "google-cloud-sdk vscode_cloudshelleditor/0.1",
        };

        // Try to list models from Cloud Code Assist
        for (const endpoint of CODE_ASSIST_ENDPOINTS) {
            try {
                const response = await fetch(
                    `${endpoint}/v1beta/projects/${projectId}/locations/us-central1/models`,
                    {
                        headers,
                        signal: AbortSignal.timeout(5000),
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    const models = data.models || [];

                    console.log(`[Antigravity Models] API returned ${models.length} models:`, models.map((m: any) => m.name));

                    // Extract model IDs and create model info with appropriate metadata
                    const modelList = models.map((m: any) => {
                        // Keep the full model name/path from the API
                        const fullName = m.name || "";
                        const modelId = fullName.split("/").pop() || fullName;
                        const isThinking = modelId.includes("thinking");
                        const isGemini = modelId.startsWith("gemini");
                        const isClaude = modelId.startsWith("claude");

                        return {
                            id: modelId,
                            fullName: fullName, // Store full path for API calls
                            name: m.displayName || modelId,
                            contextWindow: isGemini ? 1000000 : (isThinking ? 195000 : 200000),
                            maxTokens: 8192,
                            reasoning: isThinking,
                            input: isGemini ? ["text", "image", "video", "audio"] : (isClaude ? ["text", "image"] : ["text"]),
                            cost: {
                                input: 0,
                                output: 0,
                                cacheRead: 0,
                                cacheWrite: 0,
                            },
                        };
                    });

                    return NextResponse.json({ models: modelList });
                }
            } catch (error) {
                // Try next endpoint
                continue;
            }
        }

        // If API fetch fails, return hardcoded list of known Antigravity models
        // Based on actual available models in openclaw
        const fallbackModels = [
            {
                id: "claude-opus-4-5-thinking",
                name: "Claude Opus 4.5 Thinking",
                contextWindow: 195000,
                maxTokens: 8192,
                reasoning: true,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "claude-sonnet-4-5",
                name: "Claude Sonnet 4.5",
                contextWindow: 200000,
                maxTokens: 8192,
                reasoning: false,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "claude-sonnet-4-5-thinking",
                name: "Claude Sonnet 4.5 Thinking",
                contextWindow: 195000,
                maxTokens: 8192,
                reasoning: true,
                input: ["text", "image"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "gemini-3-flash",
                name: "Gemini 3 Flash",
                contextWindow: 1000000,
                maxTokens: 8192,
                reasoning: false,
                input: ["text", "image", "video", "audio"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "gemini-3-pro-high",
                name: "Gemini 3 Pro High",
                contextWindow: 1000000,
                maxTokens: 8192,
                reasoning: false,
                input: ["text", "image", "video", "audio"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "gemini-3-pro-low",
                name: "Gemini 3 Pro Low",
                contextWindow: 1000000,
                maxTokens: 8192,
                reasoning: false,
                input: ["text", "image", "video", "audio"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
            {
                id: "gpt-oss-120b-medium",
                name: "GPT OSS 120B Medium",
                contextWindow: 128000,
                maxTokens: 4096,
                reasoning: false,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
        ];

        return NextResponse.json({ models: fallbackModels });
    } catch (error) {
        console.error("[Antigravity Models] Error:", error);
        return NextResponse.json({
            models: [],
            error: error instanceof Error ? error.message : "Failed to fetch models"
        });
    }
}
