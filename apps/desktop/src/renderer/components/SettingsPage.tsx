import React, { useEffect, useState, useCallback } from "react";

interface SettingsPageProps {
  apiBaseUrl: string;
  onBack: () => void;
}

interface Settings {
  "reading.defaultMode": string;
  "reading.mangaMode": string;
  "reading.manhwaMode": string;
  "reading.manhuaMode": string;
  "reading.webtoonMode": string;
  "ui.theme": string;
  "library.autoScan": string;
}

const defaultSettings: Settings = {
  "reading.defaultMode": "rtl",
  "reading.mangaMode": "rtl",
  "reading.manhwaMode": "vertical",
  "reading.manhuaMode": "vertical",
  "reading.webtoonMode": "vertical",
  "ui.theme": "dark",
  "library.autoScan": "false",
};

const readingModes = [
  {
    value: "rtl",
    label: "Right to Left (Manga)",
    description: "Traditional manga reading direction",
  },
  { value: "ltr", label: "Left to Right", description: "Western comic style" },
  {
    value: "vertical",
    label: "Vertical (Webtoon)",
    description: "Scroll down continuously",
  },
];

const mediaTypes = [
  {
    key: "manga",
    label: "Manga (Japanese)",
    description: "Traditional Japanese manga",
  },
  {
    key: "manhwa",
    label: "Manhwa (Korean)",
    description: "Korean web comics, typically vertical scroll",
  },
  {
    key: "manhua",
    label: "Manhua (Chinese)",
    description: "Chinese comics, typically vertical scroll",
  },
  {
    key: "webtoon",
    label: "Webtoon",
    description: "Digital comics designed for vertical scrolling",
  },
];

export function SettingsPage({ apiBaseUrl, onBack }: SettingsPageProps) {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [directories, setDirectories] = useState<string[]>([]);
  const [newDirectory, setNewDirectory] = useState("");
  const [savingDir, setSavingDir] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Categories state
  const [categories, setCategories] = useState<
    Array<{ id: string; name: string; color: string | null; sortOrder: number }>
  >([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryColor, setNewCategoryColor] = useState("#6366f1");
  const [savingCategory, setSavingCategory] = useState(false);

  useEffect(() => {
    loadSettings();
    loadDirectories();
    loadCategories();
  }, [apiBaseUrl]);

  // Clear success message after 2 seconds
  useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  async function loadSettings() {
    try {
      setLoading(true);
      const response = await fetch(`${apiBaseUrl}/api/settings`);
      if (!response.ok) throw new Error("Failed to load settings");
      const data = await response.json();
      setSettings({ ...defaultSettings, ...data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }

  async function loadDirectories() {
    try {
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/local/configure`,
      );
      if (response.ok) {
        const data = await response.json();
        setDirectories(data.directories || []);
      }
    } catch (err) {
      console.error("Failed to load directories:", err);
    }
  }

  async function loadCategories() {
    try {
      const response = await fetch(`${apiBaseUrl}/api/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  }

  async function addCategory() {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    try {
      setSavingCategory(true);
      const response = await fetch(`${apiBaseUrl}/api/categories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed, color: newCategoryColor }),
      });

      if (response.ok) {
        setNewCategoryName("");
        setSaveSuccess("Category added");
        await loadCategories();
      } else {
        const error = await response.json();
        setError(error.error || "Failed to add category");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add category");
    } finally {
      setSavingCategory(false);
    }
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm("Are you sure you want to delete this category?")) return;

    try {
      const response = await fetch(
        `${apiBaseUrl}/api/categories/${categoryId}`,
        {
          method: "DELETE",
        },
      );

      if (response.ok) {
        setSaveSuccess("Category deleted");
        await loadCategories();
      } else {
        const error = await response.json();
        setError(error.error || "Failed to delete category");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete category",
      );
    }
  }

  async function handleScan() {
    try {
      setScanning(true);
      setError(null);

      const response = await fetch(`${apiBaseUrl}/api/library/scan`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Scan failed");
      const result = await response.json();

      if (result.errors && result.errors.length > 0) {
        setError(`Scan completed with errors: ${result.errors.join(", ")}`);
      } else {
        setSaveSuccess(
          `Scan complete: ${result.added || 0} added, ${result.updated || 0} updated`,
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Scan failed");
    } finally {
      setScanning(false);
    }
  }

  const saveSetting = useCallback(
    async (key: keyof Settings, value: string) => {
      try {
        setSaving((prev) => ({ ...prev, [key]: true }));

        const response = await fetch(`${apiBaseUrl}/api/settings/${key}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });

        if (!response.ok) throw new Error("Failed to save setting");

        setSaveSuccess("Saved");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save setting");
      } finally {
        setSaving((prev) => ({ ...prev, [key]: false }));
      }
    },
    [apiBaseUrl],
  );

  async function saveDirectories(dirs: string[]) {
    try {
      setSavingDir(true);
      const response = await fetch(
        `${apiBaseUrl}/api/library/sources/local/configure`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ directories: dirs }),
        },
      );
      if (!response.ok) throw new Error("Failed to save directories");
      setSaveSuccess("Directories saved");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save directories",
      );
    } finally {
      setSavingDir(false);
    }
  }

  async function addDirectory() {
    const trimmed = newDirectory.trim();
    if (trimmed && !directories.includes(trimmed)) {
      const updated = [...directories, trimmed];
      setDirectories(updated);
      setNewDirectory("");
      await saveDirectories(updated);
    }
  }

  async function removeDirectory(dir: string) {
    const updated = directories.filter((d) => d !== dir);
    setDirectories(updated);
    await saveDirectories(updated);
  }

  function updateSetting(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveSetting(key, value);
  }

  async function resetToDefaults() {
    if (!confirm("Are you sure you want to reset all settings to defaults?"))
      return;

    try {
      setLoading(true);

      // Reset each setting
      const keys = Object.keys(defaultSettings) as (keyof Settings)[];
      for (const key of keys) {
        await fetch(`${apiBaseUrl}/api/settings/${key}`, { method: "DELETE" });
      }

      setSettings(defaultSettings);
      setSaveSuccess("Settings reset to defaults");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset settings");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <div className="loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button onClick={onBack} className="btn btn-secondary back-btn">
          ← Back
        </button>
        <h1>Settings</h1>
        <div className="header-actions">
          {saveSuccess && <span className="save-indicator">{saveSuccess}</span>}
          <button
            onClick={resetToDefaults}
            className="btn btn-secondary"
            disabled={Object.values(saving).some((s) => s)}
          >
            Reset Defaults
          </button>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="settings-content">
        {/* Reading Settings */}
        <section className="settings-section">
          <h2>📖 Reading Preferences</h2>

          <div className="setting-item">
            <div className="setting-info">
              <label>Default Reading Mode</label>
              <p>Used when no specific mode is set for a media type</p>
            </div>
            <div className="setting-control">
              <select
                value={settings["reading.defaultMode"]}
                onChange={(e) =>
                  updateSetting("reading.defaultMode", e.target.value)
                }
                disabled={saving["reading.defaultMode"]}
              >
                {readingModes.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              {saving["reading.defaultMode"] && (
                <span className="saving-indicator">Saving...</span>
              )}
            </div>
          </div>

          <h3>Reading Mode by Media Type</h3>
          <p className="section-description">
            Configure different reading modes for each type of manga. These
            apply to all manga of that type unless overridden per-manga.
          </p>

          {mediaTypes.map(({ key, label, description }) => {
            const settingKey = `reading.${key}Mode` as keyof Settings;
            return (
              <div className="setting-item" key={key}>
                <div className="setting-info">
                  <label>{label}</label>
                  <p>{description}</p>
                </div>
                <div className="setting-control">
                  <select
                    value={settings[settingKey]}
                    onChange={(e) => updateSetting(settingKey, e.target.value)}
                    disabled={saving[settingKey]}
                  >
                    {readingModes.map((mode) => (
                      <option key={mode.value} value={mode.value}>
                        {mode.label}
                      </option>
                    ))}
                  </select>
                  {saving[settingKey] && (
                    <span className="saving-indicator">Saving...</span>
                  )}
                </div>
              </div>
            );
          })}
        </section>

        {/* Library Settings */}
        <section className="settings-section">
          <h2>📚 Library Preferences</h2>

          <div className="setting-item checkbox">
            <div className="setting-info">
              <label>Auto-scan on Startup</label>
              <p>Automatically scan library folders when the app starts</p>
            </div>
            <div className="setting-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={settings["library.autoScan"] === "true"}
                  onChange={(e) =>
                    updateSetting(
                      "library.autoScan",
                      e.target.checked ? "true" : "false",
                    )
                  }
                  disabled={saving["library.autoScan"]}
                />
                <span className="toggle-slider"></span>
              </label>
              {saving["library.autoScan"] && (
                <span className="saving-indicator">Saving...</span>
              )}
            </div>
          </div>

          <div className="setting-item scan-library-item">
            <div className="setting-info">
              <label>Scan Library</label>
              <p>Manually scan all configured directories for new manga</p>
            </div>
            <button
              onClick={handleScan}
              disabled={scanning || directories.length === 0}
              className="btn btn-primary"
            >
              {scanning ? "Scanning..." : "Scan Now"}
            </button>
          </div>
        </section>

        {/* Library Directories */}
        <section className="settings-section">
          <h2>📁 Library Directories</h2>
          <p className="section-description">
            Add directories containing your manga files. The app will scan these
            folders for manga.
          </p>

          <div className="directory-input-row">
            <input
              type="text"
              value={newDirectory}
              onChange={(e) => setNewDirectory(e.target.value)}
              placeholder="Enter directory path (e.g., /home/user/Manga)"
              onKeyPress={(e) => e.key === "Enter" && addDirectory()}
              className="directory-input"
            />
            <button
              onClick={addDirectory}
              disabled={!newDirectory.trim() || savingDir}
              className="btn btn-primary"
            >
              {savingDir ? "Adding..." : "Add"}
            </button>
          </div>

          <ul className="directory-list">
            {directories.map((dir) => (
              <li key={dir} className="directory-item">
                <span className="directory-path">{dir}</span>
                <button
                  onClick={() => removeDirectory(dir)}
                  disabled={savingDir}
                  className="btn btn-danger btn-small"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>

          {directories.length === 0 && (
            <div className="empty-directories">
              <p>No directories configured.</p>
              <p className="hint">
                Add at least one directory to scan for manga.
              </p>
            </div>
          )}
        </section>

        {/* Categories */}
        <section className="settings-section">
          <h2>🏷️ Categories</h2>
          <p className="section-description">
            Create categories to organize your manga library (e.g., Reading,
            Completed, On Hold, Favorites).
          </p>

          <div className="category-input-row">
            <input
              type="text"
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Enter category name"
              onKeyPress={(e) => e.key === "Enter" && addCategory()}
              className="category-input"
            />
            <input
              type="color"
              value={newCategoryColor}
              onChange={(e) => setNewCategoryColor(e.target.value)}
              className="category-color-picker"
              title="Category color"
            />
            <button
              onClick={addCategory}
              disabled={!newCategoryName.trim() || savingCategory}
              className="btn btn-primary"
            >
              {savingCategory ? "Adding..." : "Add"}
            </button>
          </div>

          <div className="categories-list">
            {categories.map((category) => (
              <div
                key={category.id}
                className="category-item"
                style={{ borderLeftColor: category.color || "#6366f1" }}
              >
                <span
                  className="category-dot"
                  style={{ backgroundColor: category.color || "#6366f1" }}
                />
                <span className="category-name">{category.name}</span>
                <button
                  onClick={() => deleteCategory(category.id)}
                  className="btn btn-danger btn-small"
                >
                  Delete
                </button>
              </div>
            ))}
          </div>

          {categories.length === 0 && (
            <div className="empty-categories">
              <p>No categories created yet.</p>
              <p className="hint">Create categories to organize your manga.</p>
            </div>
          )}
        </section>

        {/* About */}
        <section className="settings-section">
          <h2>ℹ️ About</h2>
          <div className="about-info">
            <p>
              <strong>Mugiwara Manga Reader</strong>
            </p>
            <p>Version 0.1.0</p>
            <p>
              A cross-platform manga reader with extensible plugin architecture.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
