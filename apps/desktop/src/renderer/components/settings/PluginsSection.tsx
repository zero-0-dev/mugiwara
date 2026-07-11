import React, { useState } from "react";
import { useInstalledPlugins, useAvailablePlugins, useInstallPlugin, useUninstallPlugin, useTogglePlugin } from "../../api/hooks";

interface PluginInfo {
  name: string;
  version: string;
  description?: string;
}

export function PluginsSection() {
  const { data: installed = [], isLoading, isError: installedError, error: installedErr } = useInstalledPlugins();
  const { data: available = [], isError: availableError, error: availableErr } = useAvailablePlugins();
  const installPlugin = useInstallPlugin();
  const uninstallPlugin = useUninstallPlugin();
  const togglePlugin = useTogglePlugin();

  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const queryError = installedError || availableError;
  const queryErrorMessage =
    (installedErr ?? availableErr) instanceof Error
      ? (installedErr ?? availableErr)?.message
      : "Failed to load plugins. Check your connection.";

  const filteredAvailable = (Array.isArray(available) ? available : []).filter(
    (p: PluginInfo) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) &&
      !(Array.isArray(installed) ? installed : []).find((i: { id: string }) => i.id === p.name),
  );

  if (isLoading) return <div className="loading">Loading plugins...</div>;

  return (
    <div className="plugins-section">
      <h3>Plugins</h3>
      <p className="section-description">Manage manga sources and storage backends. Install new plugins from NPM.</p>

      {queryError && <div className="error-message">{queryErrorMessage}</div>}
      {error && <div className="error-message">{error}</div>}

      <div className="installed-plugins">
        <h4>Installed Plugins</h4>
        {(Array.isArray(installed) ? installed : []).length === 0 ? (
          <p>No plugins installed.</p>
        ) : (
          <div className="plugins-list">
            {(Array.isArray(installed) ? installed : []).map((plugin: { id: string; type: string; version: string; isBuiltin: boolean; isEnabled: boolean }) => (
              <div key={plugin.id} className={`plugin-card ${plugin.isEnabled ? "enabled" : "disabled"}`}>
                <div className="plugin-header">
                  <h5>{plugin.id}</h5>
                  {plugin.isBuiltin && <span className="builtin-badge">Built-in</span>}
                </div>
                <div className="plugin-info">
                  <p><strong>Type:</strong> {plugin.type}</p>
                  <p><strong>Version:</strong> {plugin.version}</p>
                  <p><strong>Status:</strong> {plugin.isEnabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="plugin-actions">
                  {!plugin.isBuiltin && (
                    <>
                      <button onClick={() => togglePlugin.mutate({ id: plugin.id, enable: !plugin.isEnabled }, { onError: (err) => setError(err instanceof Error ? err.message : String(err)) })} className="btn btn-secondary btn-small">
                        {plugin.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button onClick={() => uninstallPlugin.mutate(plugin.id, { onError: (err) => setError(err instanceof Error ? err.message : String(err)) })} className="btn btn-danger btn-small">
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

      <div className="available-plugins">
        <h4>Available Plugins</h4>
        <input type="text" placeholder="Search plugins..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="search-input" />
        <div className="plugins-list">
          {filteredAvailable.slice(0, 10).map((plugin: PluginInfo) => (
            <div key={plugin.name} className="plugin-card available">
              <div className="plugin-header">
                <h5>{plugin.name}</h5>
                <span className="version">v{plugin.version}</span>
              </div>
              {plugin.description && <p className="description">{plugin.description}</p>}
              <button onClick={() => installPlugin.mutate({ packageName: plugin.name }, { onError: (err) => setError(err instanceof Error ? err.message : String(err)) })} disabled={installPlugin.isPending} className="btn btn-primary btn-small">
                {installPlugin.isPending ? "Installing..." : "Install"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
