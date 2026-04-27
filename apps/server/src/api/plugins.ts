import { Router, Request, Response } from "express";
import { PluginManager } from "../plugins/manager";
import { PluginInstallationService } from "../plugins/installation";
import { PluginDiscoveryService } from "../plugins/discovery";

const router: Router = Router();

// Middleware to inject services
router.use((req: any, _res, next) => {
  req.pluginManager = (global as any).pluginManager;
  req.pluginInstaller = (global as any).pluginInstaller;
  req.pluginDiscovery = (global as any).pluginDiscovery;
  next();
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

    // Get optional plugins from DB
    const dbPlugins = await installer.getInstalledPlugins();

    // Get built-in plugins from manager
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

    // Combine both lists
    const allPlugins = [...builtInPlugins, ...dbPlugins];

    res.json(allPlugins);
  } catch (error) {
    console.error("Error listing plugins:", error);
    res.status(500).json({ error: "Failed to list plugins" });
  }
});

// POST /api/plugins/install - Install a plugin
router.post("/install", async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const manager: PluginManager = req.pluginManager;
    const { packageName, version } = req.body;

    if (!packageName) {
      res.status(400).json({ error: "package is required" });
      return;
    }

    const plugin = await installer.install(packageName, version);

    // Load the plugin into memory so it's available immediately
    await manager.enablePlugin(packageName);

    res.status(201).json({
      message: "Plugin installed and activated.",
      plugin,
    });
  } catch (error) {
    console.error("Error installing plugin:", error);
    res.status(500).json({ error: "Failed to install plugin" });
  }
});

// POST /api/plugins/:id/uninstall - Uninstall a plugin
router.post("/:id/uninstall", async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const manager: PluginManager = req.pluginManager;
    const { id } = req.params;

    // Remove from memory first
    await manager.disablePlugin(id);

    // Then remove from DB and disk
    await installer.uninstall(id);

    res.json({
      message: "Plugin uninstalled.",
    });
  } catch (error) {
    console.error("Error uninstalling plugin:", error);
    const message =
      error instanceof Error ? error.message : "Failed to uninstall plugin";
    res.status(500).json({ error: message });
  }
});

// POST /api/plugins/:id/update - Update a plugin
router.post("/:id/update", async (req: any, res: Response) => {
  try {
    const installer: PluginInstallationService = req.pluginInstaller;
    const { id } = req.params;

    const plugin = await installer.update(id);
    res.json({
      message: "Plugin updated. Server restart required to activate.",
      plugin,
    });
  } catch (error) {
    console.error("Error updating plugin:", error);
    res.status(500).json({ error: "Failed to update plugin" });
  }
});

// POST /api/plugins/:id/enable - Enable a plugin
router.post("/:id/enable", async (req: any, res: Response) => {
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

// POST /api/plugins/:id/disable - Disable a plugin
router.post("/:id/disable", async (req: any, res: Response) => {
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

// PUT /api/plugins/:id/config - Update plugin configuration
router.put("/:id/config", async (req: any, res: Response) => {
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
