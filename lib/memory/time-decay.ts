export function computeTemporalScore(
  lastAccessedAt: string,
  strength: number,
  lambda: number
): number {
  const ageSeconds =
    (Date.now() - new Date(lastAccessedAt).getTime()) / 1000;
  return Math.exp((-lambda * ageSeconds) / Math.max(strength, 0.01));
}

export function computeCombinedScore(
  similarityScore: number,
  temporalScore: number,
  similarityWeight: number,
  temporalWeight: number
): number {
  return similarityWeight * similarityScore + temporalWeight * temporalScore;
}

export function reinforceStrength(currentStrength: number): number {
  return Math.min(1.0, currentStrength + 0.1 * (1 - currentStrength));
}
