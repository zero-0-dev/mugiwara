import { Router, Request, Response } from "express";
import { PluginManager } from "../plugins/manager";
import {
  PluginInstallationService,
  PluginInstallError,
} from "../plugins/installation";
import { PluginDiscoveryService } from "../plugins/discovery";
import { requireAdmin } from "../auth/middleware";
import { recordAudit } from "../services/audit";

const router: Router = Router();

// Middleware to inject services
router.use((req: any, _res, next) => {
  req.pluginManager = (global as any).pluginManager;
  req.pluginInstaller = (global as any).pluginInstaller;
  req.pluginDiscovery = (global as any).pluginDiscovery;
  next();
});

function auditActor(req: Request): string | null {
  return req.auth?.id ?? null;
}

function sendPluginError(
  res: Response,
  error: unknown,
  fallback: string,
): void {
  if (error instanceof PluginInstallError) {
    res
      .status(error.statusCode)
      .json({ error: error.message, code: error.code });
    return;
  }
  console.error(
    fallback,
    error instanceof Error ? error.message : "unknown error",
  );
  res.status(500).json({ error: fallback });
}

// GET /api/plugins/policy - Whether installs are allowed and the registry rules
router.get("/policy", async (req: any, res: Response) => {
  const installer: PluginInstallationService | undefined = req.pluginInstaller;
  if (!installer) {
    res.status(503).json({ error: "Plugin installer not initialized" });
    return;
  }
  res.json(installer.getPolicy());
});

// GET /api/plugins/available - Search available plugins on NPM
router.get("/available", async (req: any, res: Response) => {
  try {
    const discovery: PluginDiscoveryService = req.pluginDiscovery;
    const { query, type } = req.query;

    const plugins = await discovery.searchPlugins(
      query as string,
      type as "source" | "storage",
    );

    res.json(plugins);
  } catch (error) {
    console.error("Error searching plugins:", error);
    res.status(500).json({ error: "Failed to search plugins" });
  }
});

// GET /api/plugins/installed - List installed plugins (including built-in)
router.get("/installed", async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const manager: PluginManager = req.pluginManager;

    const dbPlugins = await installer.getInstalledPlugins();

    const builtInPlugins = manager
      .getLoadedPlugins()
      .filter((p) => p.record.isBuiltin)
      .map((p) => ({
        id: p.record.id,
        type: p.record.type,
        version: p.record.version,
        isBuiltin: true,
        isEnabled: true,
        config: p.record.config,
        installedAt: p.record.installedAt,
        updatedAt: p.record.updatedAt,
      }));

    res.json([...builtInPlugins, ...dbPlugins]);
  } catch (error) {
    console.error("Error listing plugins:", error);
    res.status(500).json({ error: "Failed to list plugins" });
  }
});

// POST /api/plugins/install - Install a plugin (admin + explicit confirmation)
router.post("/install", requireAdmin, async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const manager: PluginManager = req.pluginManager;
    const { packageName, version, confirm } = req.body ?? {};

    if (confirm !== true) {
      res.status(400).json({
        error:
          "Explicit confirmation is required. Re-send with confirm: true after reviewing the package.",
      });
      return;
    }

    if (!installer) {
      res.status(503).json({ error: "Plugin installer not initialized" });
      return;
    }

    if (!installer.getPolicy().installEnabled) {
      const policy = installer.getPolicy();
      recordAudit({
        event: "plugin.install.blocked",
        actor: auditActor(req),
        ip: req.ip ?? req.socket.remoteAddress ?? null,
        details: {
          packageName: typeof packageName === "string" ? packageName : null,
          reason: policy.reason,
        },
      });
      res.status(403).json({
        error: policy.reason ?? "Plugin installation is disabled",
        code: "plugin_install_disabled",
      });
      return;
    }

    const plugin = await installer.install(packageName, version);

    await manager.enablePlugin(plugin.id);

    recordAudit({
      event: "plugin.install",
      actor: auditActor(req),
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: {
        packageName: plugin.id,
        version: plugin.version,
      },
    });

    res.status(201).json({
      message: "Plugin installed and activated.",
      plugin,
    });
  } catch (error) {
    recordAudit({
      event: "plugin.install.failed",
      actor: auditActor(req),
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: {
        packageName:
          typeof req.body?.packageName === "string"
            ? req.body.packageName
            : null,
        reason: error instanceof Error ? error.message : "unknown",
      },
    });
    sendPluginError(res, error, "Failed to install plugin");
  }
});

// POST /api/plugins/:id/uninstall - Uninstall a plugin (admin + confirmation)
router.post("/:id/uninstall", requireAdmin, async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const manager: PluginManager = req.pluginManager;
    const { id } = req.params;

    if (req.body?.confirm !== true) {
      res.status(400).json({
        error: "Explicit confirmation is required. Re-send with confirm: true.",
      });
      return;
    }

    await manager.disablePlugin(id);
    await installer.uninstall(id);

    recordAudit({
      event: "plugin.uninstall",
      actor: auditActor(req),
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { packageName: id },
    });

    res.json({ message: "Plugin uninstalled." });
  } catch (error) {
    sendPluginError(res, error, "Failed to uninstall plugin");
  }
});

// POST /api/plugins/:id/update - Update a plugin (admin + confirmation)
router.post("/:id/update", requireAdmin, async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const { id } = req.params;

    if (req.body?.confirm !== true) {
      res.status(400).json({
        error: "Explicit confirmation is required. Re-send with confirm: true.",
      });
      return;
    }

    const plugin = await installer.update(id);

    recordAudit({
      event: "plugin.update",
      actor: auditActor(req),
      ip: req.ip ?? req.socket.remoteAddress ?? null,
      details: { packageName: id, version: plugin.version },
    });

    res.json({
      message: "Plugin updated. Server restart required to activate.",
      plugin,
    });
  } catch (error) {
    sendPluginError(res, error, "Failed to update plugin");
  }
});

// POST /api/plugins/:id/enable - Enable a plugin (admin)
router.post("/:id/enable", requireAdmin, async (req: any, res: Response) => {
  try {
    const manager: PluginManager = req.pluginManager;
    const { id } = req.params;

    await manager.enablePlugin(id);
    res.json({ message: "Plugin enabled" });
  } catch (error) {
    console.error("Error enabling plugin:", error);
    res.status(500).json({ error: "Failed to enable plugin" });
  }
});

// POST /api/plugins/:id/disable - Disable a plugin (admin)
router.post("/:id/disable", requireAdmin, async (req: any, res: Response) => {
  try {
    const manager: PluginManager = req.pluginManager;
    const { id } = req.params;

    await manager.disablePlugin(id);
    res.json({ message: "Plugin disabled" });
  } catch (error) {
    console.error("Error disabling plugin:", error);
    res.status(500).json({ error: "Failed to disable plugin" });
  }
});

// GET /api/plugins/:id/config - Get plugin configuration
router.get("/:id/config", async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const plugins = await installer.getInstalledPlugins();
    const plugin = plugins.find((p) => p.id === req.params.id);

    if (!plugin) {
      res.status(404).json({ error: "Plugin not found" });
      return;
    }

    res.json(plugin.config);
  } catch (error) {
    console.error("Error getting plugin config:", error);
    res.status(500).json({ error: "Failed to get plugin config" });
  }
});

// PUT /api/plugins/:id/config - Update plugin configuration (admin)
router.put("/:id/config", requireAdmin, async (req: any, res: Response) => {
  try {
    const manager: PluginManager = req.pluginManager;
    const { id } = req.params;
    const config = req.body;

    await manager.updatePluginConfig(id, config);
    res.json({ message: "Plugin configuration updated" });
  } catch (error) {
    console.error("Error updating plugin config:", error);
    res.status(500).json({ error: "Failed to update plugin config" });
  }
});

export default router;
