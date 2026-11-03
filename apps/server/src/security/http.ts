import type { Request, Response, NextFunction } from "express";

export const SESSION_COOKIE = "mugiwara_session";

const DEFAULT_CLIENT_ORIGINS = [
  // Vite dev server used by the browser and Electron dev shell.
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  // Capacitor WebViews. Android uses http://localhost, iOS uses
  // capacitor://localhost. https://localhost covers newer configurations.
  "http://localhost",
  "https://localhost",
  "capacitor://localhost",
];

export interface OriginPolicy {
  isAllowed(origin: string, req: Request): boolean;
  allowedOrigins: string[];
}

export function createOriginPolicy(
  extraOrigins: string[] = [],
  env: NodeJS.ProcessEnv = process.env,
): OriginPolicy {
  const configured = [
    ...parseOriginList(env.MUGIWARA_ALLOWED_ORIGINS),
    ...extraOrigins,
  ]
    .map((origin) => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .filter((origin) => {
      if (origin === "*") {
        console.warn(
          "⚠️  Ignoring MUGIWARA_ALLOWED_ORIGINS wildcard; configure explicit origins instead.",
        );
        return false;
      }
      return true;
    });

  const fixedOrigins = Array.from(
    new Set([...DEFAULT_CLIENT_ORIGINS, ...configured]),
  );

  return {
    allowedOrigins: fixedOrigins,
    isAllowed(origin: string, req: Request): boolean {
      const normalized = normalizeOrigin(origin);
      if (!normalized) return false;
      if (fixedOrigins.includes(normalized)) return true;

      // The server-served web app, Electron production window and any reverse
      // proxy host are same-origin. Derive it from the request instead of
      // trusting a wildcard.
      const host = req.get("host");
      if (!host) return false;
      const protocol = req.protocol;
      const sameOrigin = `${protocol}://${host}`;
      if (normalized === sameOrigin) return true;

      // Some clients omit/proxy the protocol; allow the matching host on both
      // schemes when the request itself arrived on that host.
      return (
        normalized === `http://${host}` || normalized === `https://${host}`
      );
    },
  };
}

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/+$/, "");
  try {
    const parsed = new URL(trimmed);
    // `new URL("capacitor://localhost").origin` is "null" in Node, so custom
    // schemes used by native WebViews must keep their literal form.
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.origin;
    }
    return trimmed;
  } catch {
    return trimmed;
  }
}

function parseOriginList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function createCorsMiddleware(policy: OriginPolicy) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const origin = req.get("origin");
    if (!origin) {
      if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
      }
      next();
      return;
    }

    if (!policy.isAllowed(origin, req)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", appendVary(res.getHeader("Vary"), "Origin"));

    if (req.method === "OPTIONS") {
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        req.get("access-control-request-headers") ||
          "Authorization,Content-Type",
      );
      res.setHeader("Access-Control-Max-Age", "600");
      res.status(204).end();
      return;
    }

    next();
  };
}

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function createCsrfMiddleware(policy: OriginPolicy) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.path.startsWith("/api/")) {
      next();
      return;
    }
    if (!MUTATING_METHODS.has(req.method)) {
      next();
      return;
    }

    const contentType = (req.get("content-type") || "")
      .split(";")[0]!
      .trim()
      .toLowerCase();

    // Form-encoded writes are a classic CSRF vector and no API route needs
    // them. Multipart is currently unused but kept allowed for future uploads.
    if (contentType === "application/x-www-form-urlencoded") {
      res.status(415).json({ error: "Form-encoded writes are not supported" });
      return;
    }

    const hasBody =
      Number(req.get("content-length") || "0") > 0 ||
      Boolean(req.get("transfer-encoding"));
    if (
      hasBody &&
      contentType &&
      contentType !== "application/json" &&
      !contentType.startsWith("multipart/")
    ) {
      res.status(415).json({ error: "Unsupported content type" });
      return;
    }

    const origin = req.get("origin");
    const site = req.get("sec-fetch-site");

    if (site === "cross-site") {
      res.status(403).json({ error: "Cross-site request rejected" });
      return;
    }

    if (origin && !policy.isAllowed(origin, req)) {
      res.status(403).json({ error: "Origin not allowed" });
      return;
    }

    // Browser state-changing requests always carry Origin (or at least
    // Sec-Fetch-Site). A missing origin is allowed for native clients and
    // curl; those never carry ambient cookies.
    next();
  };
}

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.replace(/^::ffff:/i, "").split("%")[0]!;
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "localhost"
  );
}

export function isLoopbackRequest(req: Request): boolean {
  return isLoopbackAddress(req.socket.remoteAddress);
}

export function parseCookieHeader(
  header: string | undefined,
): Record<string, string> {
  if (!header) return {};
  const cookies: Record<string, string> = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (!key) continue;
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

export function getSessionToken(req: Request): string | null {
  const value = parseCookieHeader(req.get("cookie"))[SESSION_COOKIE];
  return value || null;
}

export function setSessionCookie(
  req: Request,
  res: Response,
  token: string,
): void {
  const secure =
    req.secure ||
    req.get("x-forwarded-proto") === "https" ||
    process.env.MUGIWARA_COOKIE_SECURE === "true";
  const maxAge = 60 * 60 * 24 * 30;
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
      secure ? "; Secure" : ""
    }`,
  );
}

export function clearSessionCookie(req: Request, res: Response): void {
  const secure =
    req.secure ||
    req.get("x-forwarded-proto") === "https" ||
    process.env.MUGIWARA_COOKIE_SECURE === "true";
  res.append(
    "Set-Cookie",
    `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${
      secure ? "; Secure" : ""
    }`,
  );
}

function appendVary(
  current: string | number | string[] | undefined,
  value: string,
): string {
  const parts = String(current ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.some((part) => part.toLowerCase() === value.toLowerCase())) {
    parts.push(value);
  }
  return parts.join(", ");
}
