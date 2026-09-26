export type ExtensionRiskCategory = "extension" | "automation" | "media-behavior";
export type ExtensionRiskConfidence = "low" | "medium" | "high";
export type ExtensionRiskLevel = "low" | "guarded" | "high" | "critical";

export interface ExtensionRiskSignalDefinition {
  method: string;
  name: string;
  category: ExtensionRiskCategory;
  weight: number;
  confidence: ExtensionRiskConfidence;
}

export const EXTENSION_RISK_SIGNALS: readonly ExtensionRiskSignalDefinition[] = [
  { method: "extension-dom-marker", name: "Browser extension DOM marker observed", category: "extension", weight: 5, confidence: "low" },
  { method: "extension-protocol-resource", name: "Extension-origin resource injected", category: "extension", weight: 40, confidence: "high" },
  { method: "capture-extension-injection", name: "Capture-related extension injection observed", category: "extension", weight: 35, confidence: "medium" },
  { method: "external-iframe-injection", name: "Unexpected external iframe injected", category: "extension", weight: 15, confidence: "low" },
  { method: "protected-api-instrumented", name: "Protected browser API appears instrumented", category: "extension", weight: 20, confidence: "medium" },
  { method: "dom-mutation-burst", name: "Unusual external DOM mutation burst", category: "extension", weight: 10, confidence: "low" },
  { method: "automation-webdriver", name: "Browser automation webdriver signal", category: "automation", weight: 60, confidence: "high" },
  { method: "automation-global-marker", name: "Browser automation global marker", category: "automation", weight: 45, confidence: "high" },
  { method: "media-non-image-fetch", name: "Proof asset fetched outside normal image navigation", category: "media-behavior", weight: 25, confidence: "medium" },
  { method: "media-repeat-fetch", name: "Repeated proof asset retrieval burst", category: "media-behavior", weight: 30, confidence: "medium" },
  { method: "media-request-burst", name: "High-rate proof asset request burst", category: "media-behavior", weight: 45, confidence: "high" },
  { method: "media-enumeration-burst", name: "Rapid unique proof asset enumeration", category: "media-behavior", weight: 50, confidence: "high" },
] as const;

const signalMap = new Map(EXTENSION_RISK_SIGNALS.map((signal) => [signal.method, signal]));

export function extensionRiskDefinition(method: string) {
  return signalMap.get(method) ?? null;
}

export function extensionRiskLevel(score: number): ExtensionRiskLevel {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 25) return "guarded";
  return "low";
}

export function clampRiskScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}
