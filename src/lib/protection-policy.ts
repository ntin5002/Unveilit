export type ProtectionMode = "standard" | "enhanced" | "strict";
export type WatermarkStyle = "center" | "tiled" | "diagonal" | "corners" | "multi";
export type ProofLongEdge = 1500 | 2048;

export interface WatermarkPolicy {
  enabled: boolean;
  style: WatermarkStyle;
  customText: string | null;
  includeGalleryName: boolean;
  includeClientIdentity: boolean;
  includePhotoTrace: boolean;
  /** Server-generated HMAC trace embedded into worker-baked proof pixels. */
  forensicTraceEnabled: boolean;
  opacity: number;
  density: number;
  dynamicSessionOverlay: boolean;
}

export interface ProtectionPolicy {
  shortcutShield: boolean;
  privacyOnBlur: boolean;
  privacyOnHidden: boolean;
  printShield: boolean;
  contextMenuShield: boolean;
  dragShield: boolean;
  copyShield: boolean;
  saveShortcutShield: boolean;
  developerShortcutShield: boolean;
  selectionShield: boolean;
  auditAttempts: boolean;
  repeatedAttemptLock: boolean;
  lockAfterAttempts: number;
  lockSeconds: number;
  protectAfterUnlock: boolean;
  extensionRiskEngine: boolean;
  automationRiskEngine: boolean;
  riskCurtainThreshold: number;
  riskLockThreshold: number;
}

export const DEFAULT_PROOF_LONG_EDGE: ProofLongEdge = 2048;

export const DEFAULT_WATERMARK_POLICY: WatermarkPolicy = {
  enabled: true,
  style: "multi",
  customText: null,
  includeGalleryName: true,
  includeClientIdentity: true,
  includePhotoTrace: true,
  forensicTraceEnabled: true,
  opacity: 0.24,
  density: 4,
  dynamicSessionOverlay: true,
};

const STANDARD_PROTECTION: ProtectionPolicy = {
  shortcutShield: true,
  privacyOnBlur: false,
  privacyOnHidden: true,
  printShield: true,
  contextMenuShield: true,
  dragShield: true,
  copyShield: false,
  saveShortcutShield: true,
  developerShortcutShield: false,
  selectionShield: true,
  auditAttempts: true,
  repeatedAttemptLock: false,
  lockAfterAttempts: 4,
  lockSeconds: 15,
  protectAfterUnlock: false,
  extensionRiskEngine: true,
  automationRiskEngine: true,
  riskCurtainThreshold: 70,
  riskLockThreshold: 95,
};

const ENHANCED_PROTECTION: ProtectionPolicy = {
  ...STANDARD_PROTECTION,
  privacyOnBlur: true,
  copyShield: true,
  repeatedAttemptLock: true,
  lockAfterAttempts: 4,
  lockSeconds: 20,
  riskCurtainThreshold: 55,
  riskLockThreshold: 85,
};

const STRICT_PROTECTION: ProtectionPolicy = {
  ...ENHANCED_PROTECTION,
  developerShortcutShield: true,
  lockAfterAttempts: 3,
  lockSeconds: 30,
  riskCurtainThreshold: 45,
  riskLockThreshold: 75,
};

function clamp(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

export function normalizeProtectionMode(value: unknown): ProtectionMode {
  return value === "standard" || value === "strict" ? value : "enhanced";
}

export function normalizeProofLongEdge(value: unknown): ProofLongEdge {
  return Number(value) === 1500 ? 1500 : 2048;
}

export function resolveProtectionPolicy(
  modeValue: unknown,
  override: unknown
): ProtectionPolicy {
  const mode = normalizeProtectionMode(modeValue);
  const base = mode === "strict" ? STRICT_PROTECTION : mode === "standard" ? STANDARD_PROTECTION : ENHANCED_PROTECTION;
  const input = override && typeof override === "object" ? (override as Record<string, unknown>) : {};
  const riskCurtainThreshold = Math.round(clamp(input.riskCurtainThreshold, base.riskCurtainThreshold, 30, 95));
  const requestedRiskLockThreshold = Math.round(clamp(input.riskLockThreshold, base.riskLockThreshold, 50, 100));
  const riskLockThreshold = Math.max(riskCurtainThreshold, requestedRiskLockThreshold);
  return {
    shortcutShield: bool(input.shortcutShield, base.shortcutShield),
    privacyOnBlur: bool(input.privacyOnBlur, base.privacyOnBlur),
    privacyOnHidden: bool(input.privacyOnHidden, base.privacyOnHidden),
    printShield: bool(input.printShield, base.printShield),
    contextMenuShield: bool(input.contextMenuShield, base.contextMenuShield),
    dragShield: bool(input.dragShield, base.dragShield),
    copyShield: bool(input.copyShield, base.copyShield),
    saveShortcutShield: bool(input.saveShortcutShield, base.saveShortcutShield),
    developerShortcutShield: bool(input.developerShortcutShield, base.developerShortcutShield),
    selectionShield: bool(input.selectionShield, base.selectionShield),
    auditAttempts: bool(input.auditAttempts, base.auditAttempts),
    repeatedAttemptLock: bool(input.repeatedAttemptLock, base.repeatedAttemptLock),
    lockAfterAttempts: Math.round(clamp(input.lockAfterAttempts, base.lockAfterAttempts, 2, 10)),
    lockSeconds: Math.round(clamp(input.lockSeconds, base.lockSeconds, 5, 120)),
    protectAfterUnlock: bool(input.protectAfterUnlock, base.protectAfterUnlock),
    extensionRiskEngine: bool(input.extensionRiskEngine, base.extensionRiskEngine),
    automationRiskEngine: bool(input.automationRiskEngine, base.automationRiskEngine),
    riskCurtainThreshold,
    riskLockThreshold,
  };
}

export function resolveWatermarkPolicy(override: unknown): WatermarkPolicy {
  const input = override && typeof override === "object" ? (override as Record<string, unknown>) : {};
  const style: WatermarkStyle = ["center", "tiled", "diagonal", "corners", "multi"].includes(String(input.style))
    ? (String(input.style) as WatermarkStyle)
    : DEFAULT_WATERMARK_POLICY.style;
  return {
    enabled: bool(input.enabled, DEFAULT_WATERMARK_POLICY.enabled),
    style,
    customText:
      typeof input.customText === "string" && input.customText.trim()
        ? input.customText.trim().slice(0, 120)
        : null,
    includeGalleryName: bool(input.includeGalleryName, DEFAULT_WATERMARK_POLICY.includeGalleryName),
    includeClientIdentity: bool(input.includeClientIdentity, DEFAULT_WATERMARK_POLICY.includeClientIdentity),
    includePhotoTrace: bool(input.includePhotoTrace, DEFAULT_WATERMARK_POLICY.includePhotoTrace),
    forensicTraceEnabled: true,
    opacity: clamp(input.opacity, DEFAULT_WATERMARK_POLICY.opacity, 0.08, 0.5),
    density: Math.round(clamp(input.density, DEFAULT_WATERMARK_POLICY.density, 2, 7)),
    dynamicSessionOverlay: bool(input.dynamicSessionOverlay, DEFAULT_WATERMARK_POLICY.dynamicSessionOverlay),
  };
}

export function maskedEmail(email?: string | null) {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.split("@");
  if (!local || !domain) return null;
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"•".repeat(Math.max(3, Math.min(7, local.length - visible.length)))}@${domain}`;
}

export function sanitizeWatermarkText(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 220);
}
