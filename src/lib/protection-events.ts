export type ProtectionEventStrength = "strong" | "traceability" | "deterrent" | "best-effort" | "heuristic";

export interface ProtectionEventDefinition {
  eventType: string;
  method: string;
  name: string;
  strength: ProtectionEventStrength;
}

/**
 * Human-readable event names used by browser diagnostics and persisted audit rows.
 * Unknown methods remain recordable, but known methods should always surface by name.
 */
export const PROTECTION_EVENT_DEFINITIONS: readonly ProtectionEventDefinition[] = [
  { eventType: "capture_prearm", method: "windows-shift-prearm", name: "Windows + Shift capture pre-arm", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "windows-meta-shift-s", name: "Windows Snipping Tool shortcut (Win + Shift + S)", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "print-screen-keydown", name: "PrintScreen key pressed", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "print-screen-keyup-fallback", name: "PrintScreen key released fallback", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "browser-fullscreen-f11", name: "Browser fullscreen shortcut (F11)", strength: "best-effort" },
  { eventType: "privacy_signal", method: "browser-fullscreen-heuristic", name: "Browser fullscreen display detected", strength: "best-effort" },
  { eventType: "privacy_signal", method: "dom-fullscreen-entry", name: "Document fullscreen entry detected", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "mac-command-shift-3", name: "macOS full-screen capture shortcut", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "mac-command-shift-4", name: "macOS selection capture shortcut", strength: "best-effort" },
  { eventType: "capture_shortcut", method: "mac-command-shift-5", name: "macOS capture controls shortcut", strength: "best-effort" },
  { eventType: "privacy_signal", method: "window-blur", name: "Window focus lost privacy curtain", strength: "best-effort" },
  { eventType: "privacy_signal", method: "document-hidden", name: "Hidden tab privacy curtain", strength: "best-effort" },
  { eventType: "print_attempt", method: "print-shortcut", name: "Print shortcut (Ctrl/Cmd + P)", strength: "deterrent" },
  { eventType: "print_attempt", method: "browser-print", name: "Browser print lifecycle", strength: "deterrent" },
  { eventType: "save_attempt", method: "save-shortcut", name: "Save page shortcut (Ctrl/Cmd + S)", strength: "deterrent" },
  { eventType: "copy_attempt", method: "clipboard-copy", name: "Clipboard copy attempt", strength: "deterrent" },
  { eventType: "copy_attempt", method: "clipboard-cut", name: "Clipboard cut attempt", strength: "deterrent" },
  { eventType: "context_menu_attempt", method: "context-menu", name: "Right-click / context-menu attempt", strength: "deterrent" },
  { eventType: "drag_attempt", method: "drag-start", name: "Image drag-out attempt", strength: "deterrent" },
  { eventType: "selection_attempt", method: "select-start", name: "Protected content selection attempt", strength: "deterrent" },
  { eventType: "developer_shortcut", method: "developer-tools-shortcut", name: "Developer Tools shortcut attempt", strength: "deterrent" },
  { eventType: "developer_shortcut", method: "view-source-shortcut", name: "View Source shortcut attempt", strength: "deterrent" },
  { eventType: "repeat_attempt_lock", method: "repeat-attempt-threshold", name: "Repeated-attempt temporary lock", strength: "deterrent" },
  { eventType: "extension_risk", method: "extension-dom-marker", name: "Browser extension DOM marker observed", strength: "heuristic" },
  { eventType: "extension_risk", method: "extension-protocol-resource", name: "Extension-origin resource injected", strength: "heuristic" },
  { eventType: "extension_risk", method: "capture-extension-injection", name: "Capture-related extension injection observed", strength: "heuristic" },
  { eventType: "extension_risk", method: "external-iframe-injection", name: "Unexpected external iframe injected", strength: "heuristic" },
  { eventType: "extension_risk", method: "protected-api-instrumented", name: "Protected browser API appears instrumented", strength: "heuristic" },
  { eventType: "extension_risk", method: "dom-mutation-burst", name: "Unusual external DOM mutation burst", strength: "heuristic" },
  { eventType: "automation_risk", method: "automation-webdriver", name: "Browser automation webdriver signal", strength: "heuristic" },
  { eventType: "automation_risk", method: "automation-global-marker", name: "Browser automation global marker", strength: "heuristic" },
  { eventType: "extension_risk", method: "media-non-image-fetch", name: "Proof asset fetched outside normal image navigation", strength: "heuristic" },
  { eventType: "extension_risk", method: "media-repeat-fetch", name: "Repeated proof asset retrieval burst", strength: "heuristic" },
  { eventType: "extension_risk", method: "media-request-burst", name: "High-rate proof asset request burst", strength: "heuristic" },
  { eventType: "extension_risk", method: "media-enumeration-burst", name: "Rapid unique proof asset enumeration", strength: "heuristic" },
  { eventType: "risk_response", method: "risk-curtain-response", name: "Risk engine privacy curtain response", strength: "heuristic" },
  { eventType: "risk_response", method: "risk-lock-response", name: "Risk engine temporary lock response", strength: "heuristic" },
] as const;

const definitionByMethod = new Map(PROTECTION_EVENT_DEFINITIONS.map((entry) => [entry.method, entry]));

export function protectionEventName(eventType: string, method: string) {
  const definition = definitionByMethod.get(method);
  if (definition) return definition.name;
  if (method.startsWith("diagnostic-repeat-")) {
    const sequence = method.slice("diagnostic-repeat-".length);
    return `Repeated-attempt test action ${sequence || ""}`.trim();
  }
  return `${eventType.replaceAll("_", " ")} — ${method.replaceAll("-", " ")}`;
}

export function protectionEventStrength(eventType: string, method: string): ProtectionEventStrength {
  if (method.startsWith("diagnostic-repeat-")) return "deterrent";
  return definitionByMethod.get(method)?.strength ?? (eventType === "media_access" ? "strong" : "best-effort");
}
