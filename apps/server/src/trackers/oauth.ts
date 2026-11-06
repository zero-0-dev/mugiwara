import { createHash, randomBytes } from "crypto";

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export function createPkcePair(
  method: "S256" | "plain" = "S256",
): PkcePair {
  const verifier = randomBytes(48).toString("base64url");
  const challenge =
    method === "plain"
      ? verifier
      : createHash("sha256").update(verifier, "utf8").digest("base64url");
  return { verifier, challenge };
}

export function createOAuthState(): string {
  return randomBytes(24).toString("base64url");
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "Unknown tracker error";
}
