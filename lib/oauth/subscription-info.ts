import type { LLMProviderName, SubscriptionTier } from "@/types";

interface SubscriptionResult {
  tier: SubscriptionTier;
  metadata: Record<string, any>;
}

/**
 * Attempt to fetch the subscription tier for a provider using the OAuth access token.
 * Returns "unknown" if the provider doesn't expose subscription info or the request fails.
 */
export async function fetchSubscriptionTier(
  provider: LLMProviderName,
  accessToken: string
): Promise<SubscriptionResult> {
  try {
    switch (provider) {
      case "openai":
        return await fetchOpenAISubscription(accessToken);
      case "anthropic":
        return await fetchAnthropicSubscription(accessToken);
      case "gemini":
        return await fetchGeminiSubscription(accessToken);
      default:
        return { tier: "unknown", metadata: {} };
    }
  } catch {
    return { tier: "unknown", metadata: {} };
  }
}

async function fetchOpenAISubscription(
  accessToken: string
): Promise<SubscriptionResult> {
  const response = await fetch("https://api.openai.com/v1/organization", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    return { tier: "unknown", metadata: {} };
  }

  const data = await response.json();
  const planTitle = (data?.plan?.title || "").toLowerCase();

  let tier: SubscriptionTier = "unknown";
  if (planTitle.includes("enterprise")) tier = "enterprise";
  else if (planTitle.includes("plus") || planTitle.includes("team"))
    tier = "plus";
  else if (planTitle.includes("free")) tier = "free";

  return { tier, metadata: data };
}

async function fetchAnthropicSubscription(
  accessToken: string
): Promise<SubscriptionResult> {
  // Anthropic doesn't currently expose a public subscription endpoint.
  // When available, this will query the appropriate API.
  const response = await fetch("https://api.anthropic.com/v1/account", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "anthropic-version": "2023-06-01",
    },
  });

  if (!response.ok) {
    return { tier: "unknown", metadata: {} };
  }

  const data = await response.json();
  const planName = (data?.plan?.name || "").toLowerCase();

  let tier: SubscriptionTier = "unknown";
  if (planName.includes("max")) tier = "max";
  else if (planName.includes("pro")) tier = "pro";
  else if (planName.includes("free")) tier = "free";

  return { tier, metadata: data };
}

async function fetchGeminiSubscription(
  accessToken: string
): Promise<SubscriptionResult> {
  // Google/Gemini subscription info would come from the Cloud billing API.
  // For now, return unknown since the endpoint varies by project setup.
  return { tier: "unknown", metadata: {} };
}
