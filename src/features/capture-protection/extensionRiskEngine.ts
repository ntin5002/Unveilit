"use client";

import { extensionRiskDefinition, type ExtensionRiskSignalDefinition } from "@/lib/extension-risk";

export interface ClientRiskSignal extends ExtensionRiskSignalDefinition {
  evidence: string;
}

interface StartExtensionRiskEngineOptions {
  protectedRoot: HTMLElement | null;
  onSignal: (signal: ClientRiskSignal) => void;
}

const EXTENSION_SCHEME = /^(?:chrome-extension|moz-extension|safari-web-extension|ms-browser-extension):\/\//i;
const CAPTURE_KEYWORDS = /(?:screen[\s_-]?shot|screen[\s_-]?capture|capture[\s_-]?(?:page|screen|tool)|full[\s_-]?page|fireshot|lightshot|gofullpage|awesome[\s_-]?screenshot)/i;
const GENERIC_EXTENSION_ATTRIBUTES = [
  "data-lt-installed",
  "data-gr-ext-installed",
  "data-new-gr-c-s-check-loaded",
  "data-gramm",
  "data-gramm_editor",
];
const AUTOMATION_GLOBALS = [
  "__playwright__binding__",
  "__pwInitScripts",
  "__selenium_unwrapped",
  "__webdriver_evaluate",
  "callPhantom",
  "_phantom",
];

function nativeLike(fn: unknown) {
  if (typeof fn !== "function") return true;
  try {
    return Function.prototype.toString.call(fn).includes("[native code]");
  } catch {
    return true;
  }
}

function resourceUrl(node: Element) {
  if (node instanceof HTMLIFrameElement || node instanceof HTMLScriptElement) return node.src || "";
  if (node instanceof HTMLLinkElement) return node.href || "";
  return node.getAttribute("src") || node.getAttribute("href") || "";
}

function nodeDescriptor(node: Element) {
  const id = node.id || "";
  const className = typeof node.className === "string" ? node.className : "";
  const title = node.getAttribute("title") || "";
  const role = node.getAttribute("role") || "";
  const dataNames = Array.from(node.attributes)
    .filter((attribute) => attribute.name.startsWith("data-"))
    .map((attribute) => attribute.name)
    .join(" ");
  return `${id} ${className} ${title} ${role} ${dataNames}`;
}

function signal(method: string, evidence: string): ClientRiskSignal | null {
  const definition = extensionRiskDefinition(method);
  return definition ? { ...definition, evidence: evidence.slice(0, 180) } : null;
}

export function startExtensionRiskEngine({ protectedRoot, onSignal }: StartExtensionRiskEngineOptions) {
  const emitted = new Set<string>();
  const emitOnce = (method: string, evidence: string) => {
    const key = `${method}:${evidence}`;
    if (emitted.has(key)) return;
    emitted.add(key);
    const item = signal(method, evidence);
    if (item) onSignal(item);
  };

  if (navigator.webdriver) emitOnce("automation-webdriver", "navigator.webdriver=true");

  const windowRecord = window as unknown as Record<string, unknown>;
  const automationMarker = AUTOMATION_GLOBALS.find((name) => name in windowRecord);
  if (automationMarker) emitOnce("automation-global-marker", automationMarker);

  for (const attribute of GENERIC_EXTENSION_ATTRIBUTES) {
    if (document.documentElement.hasAttribute(attribute) || document.body?.hasAttribute(attribute)) {
      emitOnce("extension-dom-marker", attribute);
    }
  }

  for (const element of Array.from(document.querySelectorAll("iframe[src],script[src],link[href]"))) {
    const url = resourceUrl(element);
    if (EXTENSION_SCHEME.test(url)) {
      emitOnce("extension-protocol-resource", `${element.tagName.toLowerCase()}:extension-scheme`);
      if (CAPTURE_KEYWORDS.test(`${url} ${nodeDescriptor(element)}`)) {
        emitOnce("capture-extension-injection", `${element.tagName.toLowerCase()}:capture-signature`);
      }
    }
  }

  const instrumented: string[] = [];
  if (typeof HTMLCanvasElement !== "undefined" && !nativeLike(HTMLCanvasElement.prototype.toDataURL)) instrumented.push("canvas.toDataURL");
  if (typeof CanvasRenderingContext2D !== "undefined" && !nativeLike(CanvasRenderingContext2D.prototype.drawImage)) instrumented.push("canvas.drawImage");
  if (typeof window.fetch === "function" && !nativeLike(window.fetch)) instrumented.push("window.fetch");
  if (instrumented.length) emitOnce("protected-api-instrumented", instrumented.join(","));

  let mutationWindowStarted = performance.now();
  let externalMutationCount = 0;
  let burstReportedAt = 0;

  const inspect = (element: Element) => {
    if (protectedRoot?.contains(element)) return;
    const url = resourceUrl(element);
    const descriptor = nodeDescriptor(element);

    if (url && EXTENSION_SCHEME.test(url)) {
      emitOnce("extension-protocol-resource", `${element.tagName.toLowerCase()}:extension-scheme`);
      if (CAPTURE_KEYWORDS.test(`${url} ${descriptor}`)) {
        emitOnce("capture-extension-injection", `${element.tagName.toLowerCase()}:capture-signature`);
      }
    } else if (CAPTURE_KEYWORDS.test(descriptor)) {
      emitOnce("capture-extension-injection", `${element.tagName.toLowerCase()}:capture-dom-signature`);
    }

    if (element instanceof HTMLIFrameElement && url) {
      try {
        const parsed = new URL(url, location.href);
        if (parsed.origin !== location.origin && !EXTENSION_SCHEME.test(url)) {
          emitOnce("external-iframe-injection", "cross-origin iframe injected outside protected app root");
        }
      } catch { /* ignore invalid URLs */ }
    }

    for (const attribute of GENERIC_EXTENSION_ATTRIBUTES) {
      if (element.hasAttribute(attribute)) emitOnce("extension-dom-marker", attribute);
    }
  };

  const observer = new MutationObserver((mutations) => {
    const now = performance.now();
    if (now - mutationWindowStarted > 2000) {
      mutationWindowStarted = now;
      externalMutationCount = 0;
    }

    for (const mutation of mutations) {
      if (mutation.type === "attributes" && mutation.target instanceof Element) inspect(mutation.target);
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;
        if (protectedRoot?.contains(node)) continue;
        externalMutationCount += 1;
        inspect(node);
        for (const child of Array.from(node.querySelectorAll("iframe[src],script[src],link[href],[data-lt-installed],[data-gr-ext-installed],[data-new-gr-c-s-check-loaded]"))) inspect(child);
      }
    }

    if (externalMutationCount >= 40 && now - burstReportedAt > 10_000) {
      burstReportedAt = now;
      emitOnce("dom-mutation-burst", `${externalMutationCount} external nodes/2s window`);
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["src", "href", "id", "class", "title", ...GENERIC_EXTENSION_ATTRIBUTES],
  });

  return () => observer.disconnect();
}
