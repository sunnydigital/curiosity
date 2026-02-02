"use client";

import type { SubscriptionTier } from "@/types";

interface SubscriptionBadgeProps {
  tier: SubscriptionTier | string | null;
  provider: string;
}

const TIER_STYLES: Record<string, string> = {
  free: "bg-gray-100 text-gray-700 border-gray-300",
  plus: "bg-blue-100 text-blue-700 border-blue-300",
  pro: "bg-purple-100 text-purple-700 border-purple-300",
  max: "bg-amber-100 text-amber-700 border-amber-300",
  enterprise: "bg-emerald-100 text-emerald-700 border-emerald-300",
  unknown: "bg-gray-100 text-gray-600 border-gray-300",
};

const TIER_LABELS: Record<string, string> = {
  free: "Free",
  plus: "Plus",
  pro: "Pro",
  max: "Max",
  enterprise: "Enterprise",
  unknown: "Connected",
};

export function SubscriptionBadge({ tier, provider }: SubscriptionBadgeProps) {
  const resolvedTier = tier || "unknown";
  const style = TIER_STYLES[resolvedTier] || TIER_STYLES.unknown;
  const label = TIER_LABELS[resolvedTier] || "Connected";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${style}`}
    >
      {label}
    </span>
  );
}
