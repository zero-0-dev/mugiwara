import { Router, type Request, type Response } from "express";

import { trackerRepository } from "../database";
import {
  PROVIDER_LABELS,
  providerConfigured,
  resolveRedirectUri,
  trackerEnvironment,
} from "../trackers/config";
import type { TrackerSyncQueue } from "../trackers/queue";
import type { TrackerService } from "../trackers/service";
import { TrackerConfigError } from "../trackers/config";
import {
  TRACKER_PROVIDER_IDS,
  TrackerHttpError,
  isTrackerProviderId,
  type TrackerProviderId,
} from "../trackers/types";

declare global {
  var trackerService: TrackerService | undefined;
  var trackerQueue: TrackerSyncQueue | undefined;
}

function getService(): TrackerService {
  if (!global.trackerService) {
    throw new Error("Tracker service is not initialized");
  }
  return global.trackerService;
}

export function sendTrackerError(res: Response, error: unknown): void {
  if (error instanceof TrackerConfigError) {
    res.status(400).json({ error: error.message, code: "tracker_not_configured" });
    return;
  }
  if (error instanceof TrackerHttpError) {
    const status =
      error.kind === "invalid"
        ? 400
        : error.kind === "auth"
          ? 409
          : error.kind === "rate_limit"
            ? 429
            : error.kind === "network" || error.kind === "server"
              ? 502
              : 500;
    if (error.retryAfterMs != null) {
      res.setHeader("Retry-After", String(Math.ceil(error.retryAfterMs / 1000)));
    }
    res.status(status).json({
      error: error.message,
      code: error.kind,
      reconnectRequired: error.kind === "auth",
    });
    return;
  }
  console.error(
    "Tracker error:",
    error instanceof Error ? error.message : "unknown error",
  );
  res.status(500).json({ error: "Tracker operation failed" });
}

function baseUrl(req: Request): string {
  return `${req.protocol}://${req.get("host") ?? "localhost"}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function providerOrThrow(value: string | undefined): TrackerProviderId {
  if (!isTrackerProviderId(value)) {
    throw new TrackerHttpError("Unknown tracker provider", { kind: "invalid" });
  }
  return value;
}

export function createTrackersRouter(): Router {
  const router = Router();

  router.get("/accounts", async (_req: Request, res: Response) => {
    try {
      const accounts = await getService().listAccountSummaries();
      res.json(accounts);
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.get("/status", async (_req: Request, res: Response) => {
    try {
      const accounts = await getService().listAccountSummaries();
      const rows = await trackerRepository.listAllTracking();
      const conflicts = rows.filter((row) => row.syncState === "conflict").length;
      const errored = rows.filter((row) => row.syncState === "error").length;
      const lastSyncedAt =
        rows
          .map((row) => row.lastSyncedAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
      res.json({
        accounts,
        linkedManga: rows.length,
        conflicts,
        errored,
        lastSyncedAt,
        issues: rows
          .filter(
            (row) =>
              row.syncState === "error" || row.syncState === "conflict",
          )
          .map((row) => ({
            mangaId: row.mangaId,
            provider: row.trackerType,
            syncState: row.syncState,
            error: row.syncError,
          })),
        queue: global.trackerQueue?.stats() ?? null,
        providers: TRACKER_PROVIDER_IDS.map((provider) => ({
          provider,
          label: PROVIDER_LABELS[provider],
          configured: providerConfigured(provider),
        })),
      });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.get("/config", async (req: Request, res: Response) => {
    try {
      const env = trackerEnvironment();
      res.json({
        publicUrlFallback: baseUrl(req),
        providers: TRACKER_PROVIDER_IDS.map((provider) => ({
          provider,
          label: PROVIDER_LABELS[provider],
          configured: providerConfigured(provider, env),
          redirectUri: resolveRedirectUri(provider, baseUrl(req), env),
        })),
      });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.post(
    "/:provider/auth/start",
    async (req: Request, res: Response) => {
      try {
        const provider = providerOrThrow(req.params.provider);
        const started = await getService().startAuthorization(
          provider,
          baseUrl(req),
        );
        res.json(started);
      } catch (error) {
        sendTrackerError(res, error);
      }
    },
  );

  // The provider redirects the browser here, so this route is public. The
  // single-use OAuth `state` value is the CSRF check for the callback.
  router.get(
    "/:provider/auth/callback",
    async (req: Request, res: Response) => {
      const wantsJson = req.accepts(["json", "html"]) === "json";
      try {
        const provider = providerOrThrow(req.params.provider);
        if (typeof req.query.error === "string") {
          throw new TrackerHttpError(
            `Authorization was cancelled: ${req.query.error}`,
            { kind: "invalid" },
          );
        }
        const code = typeof req.query.code === "string" ? req.query.code : "";
        const state = typeof req.query.state === "string" ? req.query.state : "";
        const account = await getService().completeAuthorization(provider, {
          code,
          state,
        });
        if (wantsJson) {
          res.json({ account });
          return;
        }
        res
          .status(200)
          .type("html")
          .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>Connected</title>` +
              `<style>body{font-family:system-ui;background:#171717;color:#f5f5f5;display:grid;place-items:center;height:100vh;margin:0}main{max-width:28rem;padding:2rem;text-align:center}code{color:#fbbf24}</style>` +
              `</head><body><main><h1>${escapeHtml(account.label)} connected</h1>` +
              `<p>Signed in as <code>${escapeHtml(account.username ?? "unknown")}</code>.</p>` +
              `<p>You can close this tab and return to Mugiwara.</p>` +
              `<script>setTimeout(()=>{try{window.close()}catch{}},800)</script></main></body></html>`,
          );
      } catch (error) {
        if (wantsJson) {
          sendTrackerError(res, error);
          return;
        }
        res
          .status(400)
          .type("html")
          .send(
            `<!doctype html><html><head><meta charset="utf-8"><title>Connection failed</title></head>` +
              `<body style="font-family:system-ui;background:#171717;color:#f5f5f5;padding:2rem">` +
              `<h1>Could not connect the tracker</h1><p>${escapeHtml(
                error instanceof Error ? error.message : "Unknown error",
              )}</p><p>Return to Mugiwara and try again.</p></body></html>`,
          );
      }
    },
  );

  // Code-paste fallback for phones where the OAuth redirect cannot reach the
  // server (for example a LAN host that the phone's browser resolves
  // differently). The state + PKCE verifier still stay server-side.
  router.post("/:provider/auth/code", async (req: Request, res: Response) => {
    try {
      const provider = providerOrThrow(req.params.provider);
      const code = typeof req.body?.code === "string" ? req.body.code : "";
      const state = typeof req.body?.state === "string" ? req.body.state : "";
      const account = await getService().completeAuthorization(provider, {
        code,
        state,
      });
      res.json({ account });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.delete("/:provider", async (req: Request, res: Response) => {
    try {
      const provider = providerOrThrow(req.params.provider);
      await getService().disconnect(provider);
      res.json({ disconnected: true, provider });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.put("/:provider/mode", async (req: Request, res: Response) => {
    try {
      const provider = providerOrThrow(req.params.provider);
      const readOnly = req.body?.readOnly === true;
      await getService().setReadOnly(provider, readOnly);
      res.json({ provider, readOnly });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.post("/:provider/sync", async (req: Request, res: Response) => {
    try {
      const provider = providerOrThrow(req.params.provider);
      const mangaId =
        typeof req.body?.mangaId === "string" ? req.body.mangaId : undefined;
      const direction = req.body?.direction === "push" ? "push" : "pull";
      const queue = global.trackerQueue;
      if (mangaId) {
        const result = await getService().syncOne(mangaId, provider, direction);
        res.json(result);
        return;
      }
      if (direction === "push") {
        const result = await getService().syncAll({ direction: "push" });
        res.json(result);
        return;
      }
      const result = await getService().pullAll();
      res.json(result);
      if (queue) {
        // Nothing to enqueue here: the whole account was just pulled inline
        // through the rate limiter used by the service.
      }
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  return router;
}

export function createMangaTrackingRouter(): Router {
  const router = Router({ mergeParams: true });

  router.get("/", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      res.json(await getService().getOverview(mangaId));
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.get("/search", async (req: Request, res: Response) => {
    try {
      const provider = providerOrThrow(
        typeof req.params.provider === "string"
          ? req.params.provider
          : typeof req.query.provider === "string"
            ? req.query.provider
            : undefined,
      );
      const query = typeof req.query.q === "string" ? req.query.q : "";
      const mangaId = req.params.mangaId;
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      const results = query
        ? await getService().searchCandidates(provider, query)
        : await getService().suggestCandidates(mangaId, provider);
      res.json(results);
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.post("/link", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      const provider = providerOrThrow(req.body?.provider);
      const trackerMangaId =
        typeof req.body?.trackerMangaId === "string"
          ? req.body.trackerMangaId
          : "";
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      res.json(
        await getService().link(mangaId, provider, trackerMangaId),
      );
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.post("/sync", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      const provider = providerOrThrow(req.body?.provider);
      const direction = req.body?.direction === "push" ? "push" : "pull";
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      res.json(await getService().syncOne(mangaId, provider, direction));
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.post("/conflict", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      const provider = providerOrThrow(req.body?.provider);
      const resolution = req.body?.resolution === "remote" ? "remote" : "local";
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      res.json(
        await getService().resolveConflict(mangaId, provider, resolution),
      );
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.put("/:provider", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      const provider = providerOrThrow(req.params.provider);
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      res.json(
        await getService().updateLink(mangaId, provider, {
          status: typeof req.body?.status === "string" ? req.body.status : undefined,
          score:
            req.body?.score === null
              ? null
              : typeof req.body?.score === "number"
                ? req.body.score
                : undefined,
        }),
      );
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  router.delete("/:provider", async (req: Request, res: Response) => {
    try {
      const mangaId = req.params.mangaId;
      const provider = providerOrThrow(req.params.provider);
      if (!mangaId) {
        res.status(400).json({ error: "Manga id is required" });
        return;
      }
      await getService().unlink(mangaId, provider);
      res.json({ unlinked: true, provider });
    } catch (error) {
      sendTrackerError(res, error);
    }
  });

  return router;
}
