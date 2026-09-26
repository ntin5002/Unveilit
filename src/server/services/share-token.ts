import { createHash, randomBytes } from "node:crypto";

export function createShareToken() {
  const token = randomBytes(24).toString("base64url");
  return {
    token,
    hash: hashShareToken(token),
    hint: token.slice(-6),
  };
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
