import { Router, type Request, type Response } from "express";

import { AuthService, type AuthDeviceSummary } from "./service";
import { requireAdmin } from "./middleware";
import {
  clearSessionCookie,
  isLoopbackRequest,
  setSessionCookie,
  type OriginPolicy,
} from "../security/http";
import { rateLimit } from "../security/rate-limit";
import { recordAudit } from "../services/audit";

export function createAuthRouter(
  auth: AuthService,
  _policy: OriginPolicy,
): Router {
  const router = Router();

  const pairingLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 12,
    name: "auth-pairing",
  });
  const tokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    name: "auth-token",
  });

  router.get("/status", async (_req: Request, res: Response) => {
    const activeTokens = await auth.countActiveTokens();
    const anyTokens = await auth.hasAnyToken();
    res.json({
      authRequired: true,
      paired: activeTokens > 0,
      firstRun: !anyTokens,
      activeDevices: activeTokens,
    });
  });

  router.post(
    "/pairing/init",
    pairingLimiter,
    async (req: Request, res: Response) => {
      try {
        if (req.auth && !req.auth.isAdmin) {
          res.status(403).json({ error: "Admin access required" });
          return;
        }

        const local = isLoopbackRequest(req);
        if (!req.auth && !local && (await auth.countActiveTokens()) > 0) {
          res.status(403).json({
            error:
              "Server is already paired. Ask an authenticated admin to generate a pairing code.",
          });
          return;
        }

        const issued = auth.createPairingCode();
        console.log(
          `\n🔑 Mugiwara pairing code: ${issued.code} (valid ${Math.round(
            issued.ttlMs / 60000,
          )} minutes)`,
        );

        recordAudit({
          event: "auth.pairing.code_created",
          actor: req.auth?.id ?? null,
          ip: req.ip ?? req.socket.remoteAddress ?? null,
          details: {
            local,
            expiresAt: issued.expiresAt,
          },
        });

        if (local || req.auth) {
          res.json({
            code: issued.code,
            expiresAt: issued.expiresAt,
            expiresIn: Math.round(issued.ttlMs / 1000),
          });
          return;
        }

        // Remote first-run: the code is only visible on the server console.
        res.status(202).json({
          message: "Pairing code printed on the Mugiwara server console.",
          expiresAt: issued.expiresAt,
        });
      } catch (error) {
        console.error(
          "Error creating pairing code:",
          error instanceof Error ? error.message : "unknown error",
        );
        res.status(500).json({ error: "Failed to create pairing code" });
      }
    },
  );

  router.post("/pair", pairingLimiter, async (req: Request, res: Response) => {
    try {
      const { code, deviceLabel } = req.body ?? {};
      if (!auth.redeemPairingCode(code)) {
        recordAudit({
          event: "auth.pairing.failed",
          ip: req.ip ?? req.socket.remoteAddress ?? null,
          details: { reason: "invalid_or_expired_code" },
        });
        res.status(401).json({ error: "Invalid or expired pairing code" });
        return;
      }

      const issued = await auth.createToken(
        typeof deviceLabel === "string" && deviceLabel.trim()
          ? deviceLabel
          : "Mugiwara device",
        true,
      );
      setSessionCookie(req, res, issued.token);
      recordAudit({
        event: "auth.paired",
        actor: issued.record.id,
        ip: req.ip ?? req.socket.remoteAddress ?? null,
        details: { deviceLabel: issued.record.deviceLabel },
      });
      res.status(201).json({
        token: issued.token,
        device: serializeDevice(issued.record),
        isAdmin: issued.record.isAdmin,
      });
    } catch (error) {
      console.error(
        "Error pairing device:",
        error instanceof Error ? error.message : "unknown error",
      );
      res.status(500).json({ error: "Failed to pair device" });
    }
  });

  router.get("/me", (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    res.json({
      device: serializeDevice(req.auth),
      isAdmin: req.auth.isAdmin,
      via: req.auth.via,
    });
  });

  router.get("/devices", async (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const devices = await auth.listDevices();
    res.json(
      devices.map((device) => ({
        ...serializeDevice(device),
        isCurrent: device.id === req.auth?.id,
      })),
    );
  });

  router.post(
    "/devices/:id/revoke",
    requireAdmin,
    async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "Device id is required" });
        return;
      }
      const revoked = await auth.revokeToken(id);
      if (!revoked) {
        res.status(404).json({ error: "Device not found or already revoked" });
        return;
      }
      if (req.auth?.id === id) clearSessionCookie(req, res);
      recordAudit({
        event: "auth.device.revoked",
        actor: req.auth?.id ?? null,
        ip: req.ip ?? req.socket.remoteAddress ?? null,
        details: { revokedDeviceId: id },
      });
      res.json({ message: "Device revoked" });
    },
  );

  router.post("/rotate", async (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const issued = await auth.rotateToken(req.auth);
    setSessionCookie(req, res, issued.token);
    recordAudit({
      event: "auth.token.rotated",
      actor: issued.record.id,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { previousTokenId: req.auth.id },
    });
    res.json({
      token: issued.token,
      device: serializeDevice(issued.record),
      isAdmin: issued.record.isAdmin,
    });
  });

  router.post("/logout", async (req: Request, res: Response) => {
    if (req.auth) {
      await auth.revokeToken(req.auth.id);
      recordAudit({
        event: "auth.logout",
        actor: req.auth.id,
        ip: req.ip ?? req.socket.remoteAddress ?? null,
      });
    }
    clearSessionCookie(req, res);
    res.status(204).end();
  });

  router.post("/logout-all", async (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const count = await auth.revokeAllTokens();
    clearSessionCookie(req, res);
    recordAudit({
      event: "auth.logout_all",
      actor: req.auth.id,
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { revokedDevices: count },
    });
    res.json({ message: "All devices logged out", revokedDevices: count });
  });

  router.post("/content-token", tokenLimiter, (req: Request, res: Response) => {
    if (!req.auth) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const issued = auth.issueContentToken(req.auth.id);
    res.json({
      token: issued.token,
      expiresAt: issued.expiresAt,
      expiresIn: issued.expiresIn,
    });
  });

  return router;
}

function serializeDevice(device: AuthDeviceSummary) {
  return {
    id: device.id,
    label: device.deviceLabel,
    isAdmin: device.isAdmin,
    createdAt: device.createdAt,
    lastUsedAt: device.lastUsedAt,
    expiresAt: device.expiresAt,
    revokedAt: device.revokedAt,
  };
}
