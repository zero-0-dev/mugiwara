import type { Response, NextFunction, Request } from "express";
import { AuthService, type AuthTokenRecord } from "./service";
import { getSessionToken } from "../security/http";
import { recordAudit } from "../services/audit";

export interface AuthContext extends AuthTokenRecord {
  via: "bearer" | "cookie" | "content";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

const PUBLIC_API_PATHS = new Set([
  "/api/health",
  "/api/auth/status",
  "/api/auth/pair",
  "/api/auth/pairing/init",
]);

const CONTENT_TOKEN_QUERY = "contentToken";

export function isPublicApiPath(path: string): boolean {
  return PUBLIC_API_PATHS.has(path);
}

export function createAuthMiddleware(auth: AuthService) {
  const auditFailure = (
    req: Request,
    reason: string,
    tokenId?: string | null,
  ) => {
    recordAudit({
      event: "auth.failure",
      actor: tokenId ?? null,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: {
        reason,
        method: req.method,
        path: req.path,
      },
    });
  };

  const attach = (
    req: Request,
    record: AuthTokenRecord,
    via: AuthContext["via"],
  ): void => {
    req.auth = { ...record, via };
  };

  const tokenFromRequest = (req: Request): string | null => {
    const header = req.get("authorization");
    if (header) {
      const match = /^Bearer\s+(.+)$/i.exec(header.trim());
      if (match?.[1]) return match[1].trim();
    }
    return getSessionToken(req);
  };

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const path = req.path;
      if (!path.startsWith("/api/")) {
        next();
        return;
      }

      const publicPath = isPublicApiPath(path);
      const rawToken = tokenFromRequest(req);

      if (publicPath) {
        // Best-effort identity for handlers (for example "only admins may mint
        // pairing codes once the server is paired"). Never reject here.
        if (rawToken) {
          const record = await auth.authenticate(rawToken);
          if (record)
            attach(req, record, req.get("authorization") ? "bearer" : "cookie");
        }
        next();
        return;
      }

      if (rawToken) {
        const record = await auth.authenticate(rawToken);
        if (record) {
          attach(req, record, req.get("authorization") ? "bearer" : "cookie");
          next();
          return;
        }
        auditFailure(req, "invalid_token");
        res
          .status(401)
          .set("WWW-Authenticate", 'Bearer realm="mugiwara"')
          .json({ error: "Unauthorized" });
        return;
      }

      // Images are loaded by <img>, which cannot set an Authorization header.
      // A short-lived, content-scoped signed token is accepted only on content
      // routes. It is bound to a live auth token, so revocation invalidates it.
      if (
        path.startsWith("/api/content/") &&
        (req.method === "GET" || req.method === "HEAD")
      ) {
        const value = req.query[CONTENT_TOKEN_QUERY];
        const contentToken = typeof value === "string" ? value : null;
        if (contentToken) {
          const record = await auth.authenticateContentToken(contentToken);
          if (record) {
            attach(req, record, "content");
            next();
            return;
          }
          auditFailure(req, "invalid_content_token");
          res.status(401).json({ error: "Unauthorized" });
          return;
        }
      }

      auditFailure(req, "missing_token");
      res
        .status(401)
        .set("WWW-Authenticate", 'Bearer realm="mugiwara"')
        .json({ error: "Unauthorized" });
    } catch (error) {
      next(error);
    }
  };
}

export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.auth) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.auth.isAdmin) {
    recordAudit({
      event: "auth.admin_denied",
      actor: req.auth.id,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { method: req.method, path: req.path },
    });
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
