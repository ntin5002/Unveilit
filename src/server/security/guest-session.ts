import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { proofSessionRevision } from "./media-session";

export function guestSelectionCookieName(galleryId: string) {
  return `photo_guest_${galleryId.replace(/-/g, "")}`;
}
const GUEST_TTL_SECONDS = 30 * 24 * 60 * 60;

interface GuestSessionPayload {
  v: 1;
  galleryId: string;
  exp: number;
  ua: string;
  rev: string;
  gid: string;
}

function secret() {
  const configured = process.env.PHOTO_MEDIA_SESSION_SECRET?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("PHOTO_MEDIA_SESSION_SECRET is required in production.");
  return "photo-delivery-local-media-session-secret-change-me";
}

function uaHash(userAgent: string | null) {
  return createHmac("sha256", secret()).update(userAgent || "unknown").digest("base64url").slice(0, 16);
}

function sign(encoded: string) {
  return createHmac("sha256", secret()).update(`guest:${encoded}`).digest("base64url");
}

function encode(payload: GuestSessionPayload) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function decode(token: string | undefined, userAgent: string | null) {
  if (!token) return null;
  const [encoded, supplied, extra] = token.split(".");
  if (!encoded || !supplied || extra) return null;
  const expected = Buffer.from(sign(encoded));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as GuestSessionPayload;
    if (payload.v !== 1 || !payload.galleryId || !payload.gid || !payload.rev || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
    if (payload.ua !== uaHash(userAgent)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function guestSelectionKey(gid: string) {
  return createHmac("sha256", secret()).update(`guest-selection:${gid}`).digest("hex").slice(0, 40);
}

export function guestLabelFromKey(key: string) {
  return `Guest ${key.slice(-6).toUpperCase()}`;
}

export function readGuestSelectionSession(request: NextRequest, galleryId: string, shareTokenHash: string) {
  const payload = decode(request.cookies.get(guestSelectionCookieName(galleryId))?.value, request.headers.get("user-agent"));
  if (!payload || payload.galleryId !== galleryId || payload.rev !== proofSessionRevision(shareTokenHash)) return null;
  return payload;
}

export function ensureGuestSelectionCookie(
  request: NextRequest,
  response: NextResponse,
  input: { galleryId: string; shareTokenHash: string }
) {
  const existing = readGuestSelectionSession(request, input.galleryId, input.shareTokenHash);
  const payload: GuestSessionPayload = existing ?? {
    v: 1,
    galleryId: input.galleryId,
    exp: Math.floor(Date.now() / 1000) + GUEST_TTL_SECONDS,
    ua: uaHash(request.headers.get("user-agent")),
    rev: proofSessionRevision(input.shareTokenHash),
    gid: randomBytes(18).toString("base64url"),
  };
  if (!existing) {
    response.cookies.set({
      name: guestSelectionCookieName(input.galleryId),
      value: encode(payload),
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/public",
      maxAge: GUEST_TTL_SECONDS,
    });
  }
  return payload;
}
