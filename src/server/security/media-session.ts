import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const PROOF_SESSION_COOKIE = "photo_proof_session";
const DEFAULT_TTL_SECONDS = 10 * 60;

export interface ProofSessionPayload {
  v: 1;
  galleryId: string;
  exp: number;
  ua: string;
  /** Signed revision derived from the current gallery share-token hash. */
  rev: string;
  /** Random server-issued session identifier used only for risk correlation. */
  sid?: string;
}

function secret() {
  const configured = process.env.PHOTO_MEDIA_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") {
    throw new Error("PHOTO_MEDIA_SESSION_SECRET is required in production.");
  }
  return "photo-delivery-local-media-session-secret-change-me";
}

function userAgentHash(userAgent: string | null) {
  return createHmac("sha256", secret())
    .update(userAgent || "unknown")
    .digest("base64url")
    .slice(0, 16);
}

function sign(encodedPayload: string) {
  return createHmac("sha256", secret()).update(encodedPayload).digest("base64url");
}

export function proofSessionRevision(shareTokenHash: string) {
  return createHmac("sha256", secret())
    .update(`proof-session-revision:${shareTokenHash}`)
    .digest("base64url")
    .slice(0, 18);
}

export function proofSessionMatchesShareTokenHash(payload: ProofSessionPayload, shareTokenHash: string) {
  const expected = Buffer.from(proofSessionRevision(shareTokenHash));
  const supplied = Buffer.from(payload.rev || "");
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function proofSessionTtlSeconds() {
  const parsed = Number(process.env.PHOTO_MEDIA_SESSION_TTL_SECONDS || DEFAULT_TTL_SECONDS);
  if (!Number.isFinite(parsed)) return DEFAULT_TTL_SECONDS;
  return Math.max(120, Math.min(3600, Math.trunc(parsed)));
}

export function createProofSessionToken(galleryId: string, shareTokenHash: string, userAgent: string | null) {
  const ttl = proofSessionTtlSeconds();
  const payload: ProofSessionPayload = {
    v: 1,
    galleryId,
    exp: Math.floor(Date.now() / 1000) + ttl,
    ua: userAgentHash(userAgent),
    rev: proofSessionRevision(shareTokenHash),
    sid: randomBytes(12).toString("base64url"),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${encoded}.${sign(encoded)}`, expiresInSeconds: ttl };
}

export function verifyProofSessionToken(token: string | undefined, userAgent: string | null) {
  if (!token) return null;
  const [encoded, suppliedSignature, extra] = token.split(".");
  if (!encoded || !suppliedSignature || extra) return null;

  const expectedSignature = sign(encoded);
  const supplied = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as ProofSessionPayload;
    if (payload.v !== 1 || typeof payload.galleryId !== "string" || typeof payload.exp !== "number" || typeof payload.rev !== "string") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.ua !== userAgentHash(userAgent)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function readProofSession(request: NextRequest) {
  return verifyProofSessionToken(
    request.cookies.get(PROOF_SESSION_COOKIE)?.value,
    request.headers.get("user-agent")
  );
}

export function setProofSessionCookie(
  response: NextResponse,
  input: { galleryId: string; shareTokenHash: string; userAgent: string | null }
) {
  const { token, expiresInSeconds } = createProofSessionToken(input.galleryId, input.shareTokenHash, input.userAgent);
  response.cookies.set({
    name: PROOF_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/public",
    maxAge: expiresInSeconds,
  });
  return expiresInSeconds;
}

export function isAllowedProofAssetRequest(request: NextRequest) {
  const secFetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  const secFetchDest = request.headers.get("sec-fetch-dest")?.toLowerCase();
  if (secFetchSite === "cross-site") return false;
  if (secFetchDest && secFetchDest !== "image" && secFetchDest !== "empty") return false;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    const ref = new URL(referer);
    if (ref.origin !== request.nextUrl.origin) return false;
    return ref.pathname.startsWith("/g/") || ref.pathname.startsWith("/dashboard/protection-test");
  } catch {
    return false;
  }
}
