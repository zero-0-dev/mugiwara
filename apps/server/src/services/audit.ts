import { db } from "../database";
import { auditLogs } from "../database/schema";

export interface AuditInput {
  event: string;
  actor?: string | null;
  ip?: string | null;
  details?: Record<string, unknown> | null;
}

const REDACTED_KEY_PATTERN =
  /token|secret|password|passwd|authorization|cookie|pairing|code/i;

/**
 * Persist a security-relevant event. Audit writes must never make a request
 * fail, so errors are logged without details and swallowed.
 */
export function recordAudit(input: AuditInput): void {
  try {
    const details = input.details
      ? JSON.stringify(redactDetails(input.details))
      : null;
    db.insert(auditLogs)
      .values({
        event: input.event,
        actor: input.actor ?? null,
        ip: input.ip ?? null,
        details,
      })
      .run();
  } catch (error) {
    console.error(
      "[audit] failed to persist event:",
      error instanceof Error ? error.message : "unknown error",
    );
  }
}

function redactDetails(
  details: Record<string, unknown>,
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(details)) {
    if (REDACTED_KEY_PATTERN.test(key)) {
      safe[key] = "[redacted]";
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      safe[key] = redactDetails(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      safe[key] = value.map((item) =>
        item && typeof item === "object"
          ? redactDetails(item as Record<string, unknown>)
          : item,
      );
    } else {
      safe[key] = value;
    }
  }
  return safe;
}
