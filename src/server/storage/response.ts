import { NextResponse } from "next/server";
import { getStorageProvider } from "./index";

export async function createPrivateAssetResponse(input: {
  storageKey: string;
  mimeType: string;
  filename?: string;
  expiresInSeconds?: number;
  disposition?: "inline" | "attachment";
}) {
  const storage = getStorageProvider();
  if (storage.driver === "r2") {
    const url = await storage.createDownloadUrl(input.storageKey, input.expiresInSeconds ?? 60, { filename: input.filename, disposition: input.disposition });
    const response = NextResponse.redirect(url, 307);
    response.headers.set("Cache-Control", "private, no-store, max-age=0");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Referrer-Policy", "no-referrer");
    response.headers.set("X-Content-Type-Options", "nosniff");
    return response;
  }

  const bytes = await storage.readObject(input.storageKey);
  const headers = privateAssetHeaders(input.mimeType, input.filename, input.disposition);
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}

/**
 * Proof assets are proxied through the application instead of redirecting to a
 * raw R2 signed URL. This keeps the R2 object key and direct bucket URL out of
 * the browser and lets the request remain bound to the HttpOnly gallery session.
 */
export async function createSessionBoundProofResponse(input: {
  storageKey: string;
  mimeType: string;
  filename?: string;
}) {
  const storage = getStorageProvider();
  const bytes = await storage.readObject(input.storageKey);
  const headers = privateAssetHeaders(input.mimeType, input.filename);
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  headers.set("X-Photo-Media-Boundary", "session-proxy");
  return new Response(new Uint8Array(bytes), { status: 200, headers });
}

function privateAssetHeaders(mimeType: string, filename?: string, disposition: "inline" | "attachment" = "inline") {
  const headers = new Headers({
    "Content-Type": mimeType,
    "Cache-Control": "private, no-store, max-age=0",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
  });
  if (filename) {
    const safe = filename.replace(/[\r\n\"]/g, "_");
    headers.set("Content-Disposition", `${disposition}; filename="${safe}"`);
  }
  return headers;
}
