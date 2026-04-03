import React, { useState, useEffect } from "react";

interface Plugin {
  id: string;
  type: "source" | "storage";
  version: string;
  isBuiltin: boolean;
  isEnabled: boolean;
  config: Record<string, any>;
}

interface PluginInfo {
  name: string;
  version: string;
  description?: string;
}

interface PluginsSectionProps {
  apiBaseUrl: string;
}

export function PluginsSection({ apiBaseUrl }: PluginsSectionProps) {
  const [installed, setInstalled] = useState<Plugin[]>([]);
  const [available, setAvailable] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [installing, setInstalling] = useState<string | null>(null);

  useEffect(() => {
    loadPlugins();
  }, []);

  async function loadPlugins() {
    try {
      const [installedRes, availableRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/plugins/installed`),
        fetch(`${apiBaseUrl}/api/plugins/available`),
      ]);

      if (!installedRes.ok || !availableRes.ok)
        throw new Error("Failed to load plugins");

      setInstalled(await installedRes.json());
      setAvailable(await availableRes.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load plugins");
    } finally {
      setLoading(false);
    }
  }

  async function handleInstall(packageName: string) {
    setInstalling(packageName);
    try {
      const response = await fetch(`${apiBaseUrl}/api/plugins/install`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ package: packageName }),
      });
      if (!response.ok) throw new Error("Failed to install plugin");
      await loadPlugins();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to install plugin");
    } finally {
      setInstalling(null);
    }
  }

  async function handleUninstall(id: string) {
    if (!confirm("Are you sure you want to uninstall this plugin?")) return;

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/plugins/${id}/uninstall`,
        {
          method: "POST",
        },
      );
      if (!response.ok) throw new Error("Failed to uninstall plugin");
      await loadPlugins();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to uninstall plugin",
      );
    }
  }

  async function togglePlugin(id: string, enable: boolean) {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/plugins/${id}/${enable ? "enable" : "disable"}`,
        {
          method: "POST",
        },
      );
      if (!response.ok)
        throw new Error(`Failed to ${enable ? "enable" : "disable"} plugin`);
      await loadPlugins();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Failed to ${enable ? "enable" : "disable"} plugin`,
      );
    }
  }

  const filteredAvailable = available.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !installed.find((i) => i.id === p.name),
  );

  if (loading) return <div className="loading">Loading plugins...</div>;

  return (
    <div className="plugins-section">
      <h3>Plugins</h3>
      <p className="section-description">
        Manage manga sources and storage backends. Install new plugins from NPM.
      </p>

      {error && <div className="error-message">{error}</div>}

      {/* Installed Plugins */}
      <div className="installed-plugins">
        <h4>Installed Plugins</h4>
        {installed.length === 0 ? (
          <p>No plugins installed.</p>
        ) : (
          <div className="plugins-list">
            {installed.map((plugin) => (
              <div
                key={plugin.id}
                className={`plugin-card ${plugin.isEnabled ? "enabled" : "disabled"}`}
              >
                <div className="plugin-header">
                  <h5>{plugin.id}</h5>
                  {plugin.isBuiltin && (
                    <span className="builtin-badge">Built-in</span>
                  )}
                </div>
                <div className="plugin-info">
                  <p>
                    <strong>Type:</strong> {plugin.type}
                  </p>
                  <p>
                    <strong>Version:</strong> {plugin.version}
                  </p>
                  <p>
                    <strong>Status:</strong>{" "}
                    {plugin.isEnabled ? "Enabled" : "Disabled"}
                  </p>
                </div>
                <div className="plugin-actions">
                  {!plugin.isBuiltin && (
                    <>
                      <button
                        onClick={() =>
                          togglePlugin(plugin.id, !plugin.isEnabled)
                        }
                        className="btn btn-secondary btn-small"
                      >
                        {plugin.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        onClick={() => handleUninstall(plugin.id)}
                        className="btn btn-danger btn-small"
                      >
                        Uninstall
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Available Plugins */}
      <div className="available-plugins">
        <h4>Available Plugins</h4>
        <input
          type="text"
          placeholder="Search plugins..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
        <div className="plugins-list">
          {filteredAvailable.slice(0, 10).map((plugin) => (
            <div key={plugin.name} className="plugin-card available">
              <div className="plugin-header">
                <h5>{plugin.name}</h5>
                <span className="version">v{plugin.version}</span>
              </div>
              {plugin.description && (
                <p className="description">{plugin.description}</p>
              )}
              <button
                onClick={() => handleInstall(plugin.name)}
                disabled={installing === plugin.name}
                className="btn btn-primary btn-small"
              >
                {installing === plugin.name ? "Installing..." : "Install"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
