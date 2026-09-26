import type { ExtensionRiskSignalDefinition } from "@/lib/extension-risk";
import { clampRiskScore, extensionRiskDefinition } from "@/lib/extension-risk";

interface RequestSample {
  at: number;
  assetId: string;
  assetType: string;
}

interface SessionState {
  samples: RequestSample[];
  emittedAt: Record<string, number>;
  riskWeights: Record<string, number>;
}

const sessions = new Map<string, SessionState>();
const MAX_SESSION_STATES = 5000;

function definition(method: string): ExtensionRiskSignalDefinition | null {
  return extensionRiskDefinition(method);
}

export interface MediaRiskAssessment {
  signals: ExtensionRiskSignalDefinition[];
  requestCount20s: number;
  uniqueAssetCount10s: number;
  repeatedAssetCount10s: number;
  riskScore: number;
}

/**
 * Lightweight per-process behavior detector. It deliberately uses high
 * thresholds to avoid treating normal gallery lazy-loading as scraping.
 * Durable audit rows are written only when a signal crosses a threshold.
 */
export function assessMediaRequest(input: {
  sessionId: string;
  assetId: string;
  assetType: string;
  secFetchDest: string | null;
}): MediaRiskAssessment {
  const now = Date.now();
  let state = sessions.get(input.sessionId);
  if (!state) {
    state = { samples: [], emittedAt: {}, riskWeights: {} };
    sessions.set(input.sessionId, state);
  }

  state.samples.push({ at: now, assetId: input.assetId, assetType: input.assetType });
  state.samples = state.samples.filter((sample) => now - sample.at <= 20_000);

  if (sessions.size > MAX_SESSION_STATES) {
    const oldestKey = sessions.keys().next().value as string | undefined;
    if (oldestKey) sessions.delete(oldestKey);
  }

  const samples10s = state.samples.filter((sample) => now - sample.at <= 10_000);
  const uniqueAssetCount10s = new Set(samples10s.map((sample) => sample.assetId)).size;
  const repeatedAssetCount10s = samples10s.filter((sample) => sample.assetId === input.assetId).length;
  const requestCount20s = state.samples.length;
  const signals: ExtensionRiskSignalDefinition[] = [];

  const maybeEmit = (method: string, cooldownMs: number) => {
    if (now - (state!.emittedAt[method] || 0) < cooldownMs) return;
    const item = definition(method);
    if (!item) return;
    state!.emittedAt[method] = now;
    state!.riskWeights[method] = Math.max(state!.riskWeights[method] || 0, item.weight);
    signals.push(item);
  };

  if (input.secFetchDest && input.secFetchDest !== "image") maybeEmit("media-non-image-fetch", 30_000);
  if (repeatedAssetCount10s >= 8) maybeEmit("media-repeat-fetch", 30_000);
  if (requestCount20s >= 160) maybeEmit("media-request-burst", 60_000);
  if (uniqueAssetCount10s >= 80) maybeEmit("media-enumeration-burst", 60_000);

  const riskScore = clampRiskScore(Object.values(state.riskWeights).reduce((sum, weight) => sum + weight, 0));
  return { signals, requestCount20s, uniqueAssetCount10s, repeatedAssetCount10s, riskScore };
}
