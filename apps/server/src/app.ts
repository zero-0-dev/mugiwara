import express, { Request, Response } from "express";
import { existsSync } from "fs";
import { join } from "path";

import { db } from "./database";
import { AuthService } from "./auth/service";
import { createAuthMiddleware, type AuthContext } from "./auth/middleware";
import { createAuthRouter } from "./auth/routes";
import {
  createCorsMiddleware,
  createCsrfMiddleware,
  createOriginPolicy,
} from "./security/http";
import { rateLimit } from "./security/rate-limit";

// API Routes
import mangaRoutes from "./api/manga";
import chapterRoutes from "./api/chapters";
import libraryRoutes from "./api/library";
import contentRoutes from "./api/content";
import metadataRoutes from "./api/metadata";
import filtersRoutes from "./api/filters";
import settingsRoutes from "./api/settings";
import categoriesRoutes from "./api/categories";

// New API Routes
import storageRoutes from "./api/storage";
import pluginsRoutes from "./api/plugins";
import queueRoutes from "./api/queue";
import discoverRoutes from "./api/discover";

export interface CreateAppOptions {
  authService?: AuthService;
  webDir?: string | null;
  host?: string;
  extraOrigins?: string[];
}

export function findWebDir(): string | null {
  const candidates = [
    process.env.WEB_DIR,
    join(process.cwd(), "web"),
    join(process.cwd(), "public"),
    join(process.cwd(), "apps/web/dist"),
    join(__dirname, "../web"),
    join(__dirname, "../public"),
    join(__dirname, "../../web/dist"),
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((dir) => existsSync(join(dir, "index.html"))) ?? null;
}

export function createApp(options: CreateAppOptions = {}): express.Express {
  const app = express();
  const auth = options.authService ?? new AuthService(db);
  const webDir = options.webDir === undefined ? findWebDir() : options.webDir;
  const originPolicy = createOriginPolicy(options.extraOrigins);

  app.disable("x-powered-by");
  app.set(
    "trust proxy",
    process.env.MUGIWARA_TRUST_PROXY === "true" ? 1 : false,
  );
  app.locals.authService = auth;

  // Security headers that are safe for this app (no inline CSP yet because
  // Vite injects a module script).
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Frame-Options", "DENY");
    next();
  });

  app.use(createCorsMiddleware(originPolicy));
  app.use(createCsrfMiddleware(originPolicy));

  // Authentication runs before body parsing so unauthenticated callers cannot
  // force large JSON allocations.
  app.use(createAuthMiddleware(auth));

  // Request logging deliberately excludes query strings: content image URLs
  // carry short-lived signed tokens.
  app.use((req, _res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });

  // Global API body limit is small; imports may carry a large chapter list.
  app.use("/api/library/import", express.json({ limit: "20mb" }));
  app.use(express.json({ limit: "1mb", strict: true }));

  // Focused rate limits for brute-force and expensive routes.
  const expensiveLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    name: "expensive",
  });
  app.use("/api/discover", expensiveLimiter);
  app.use("/api/library/sources", expensiveLimiter);
  app.use("/api/library/check-updates", expensiveLimiter);
  app.use(/^\/api\/manga\/[^/]+\/metadata/, expensiveLimiter);
  app.use(
    "/api/storage/scan",
    rateLimit({ windowMs: 60 * 1000, max: 5, name: "storage-scan" }),
  );
  app.use(
    "/api/plugins/install",
    rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: "plugin-install" }),
  );
  app.use(
    /^\/api\/plugins\/[^/]+\/update/,
    rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: "plugin-update" }),
  );

  app.use("/api/auth", createAuthRouter(auth, originPolicy));

  // Health check is intentionally public for discovery.
  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      version: "2.0.0",
      web: Boolean(webDir),
      authRequired: true,
    });
  });

  // Legacy API Routes
  app.use("/api/manga", mangaRoutes);
  app.use("/api/manga/:mangaId/chapters", chapterRoutes);
  app.use("/api/manga/:mangaId/metadata", metadataRoutes);
  app.use("/api/library", libraryRoutes);
  app.use("/api/library", filtersRoutes);
  app.use("/api/settings", settingsRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/content", contentRoutes);

  // New API Routes
  app.use("/api/storage", storageRoutes);
  app.use("/api/plugins", pluginsRoutes);
  app.use("/api/queue", queueRoutes);
  app.use("/api/discover", discoverRoutes);

  // Unknown API routes should stay JSON, never return the app shell.
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  if (webDir) {
    app.use(
      express.static(webDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (filePath.endsWith(".html")) {
            res.setHeader("Cache-Control", "no-cache");
          } else {
            res.setHeader(
              "Cache-Control",
              "public, max-age=31536000, immutable",
            );
          }
        },
      }),
    );

    app.get("*", (req: Request, res: Response, next) => {
      if (req.path === "/api" || req.path.startsWith("/api/")) {
        next();
        return;
      }
      if (/\.[^/]+$/.test(req.path)) {
        next();
        return;
      }
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(join(webDir, "index.html"));
    });
  }

  app.use(
    (
      err: any,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const type = err?.type;
      if (type === "entity.too.large") {
        res.status(413).json({ error: "Request body too large" });
        return;
      }
      if (type === "entity.parse.failed" || err instanceof SyntaxError) {
        res.status(400).json({ error: "Invalid JSON body" });
        return;
      }
      // Log only the message/stack, never the request body: it may contain
      // sensitive configuration or tokens.
      console.error(
        "Error:",
        err instanceof Error ? (err.stack ?? err.message) : "unknown error",
      );
      res.status(500).json({ error: "Internal server error" });
    },
  );

  return app;
}

export type { AuthContext };
