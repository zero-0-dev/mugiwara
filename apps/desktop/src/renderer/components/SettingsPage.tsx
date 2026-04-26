import React, { useEffect, useState, useCallback } from "react";
import { StorageSection } from "./settings/StorageSection";
import { PluginsSection } from "./settings/PluginsSection";
import { QueueSection } from "./settings/QueueSection";
import pkg from "../../../package.json";

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
}

const defaultSettings: Settings = {
  "reading.defaultMode": "rtl",
  "reading.mangaMode": "rtl",
  "reading.manhwaMode": "vertical",
  "reading.manhuaMode": "vertical",
  "reading.webtoonMode": "vertical",
  "ui.theme": "dark",
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
  const [activeTab, setActiveTab] = useState<string>("reading");
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
  }, [apiBaseUrl]);

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

  function updateSetting(key: keyof Settings, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
    saveSetting(key, value);
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "reading":
        return (
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
              Configure different reading modes for each type of manga.
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
                      onChange={(e) =>
                        updateSetting(settingKey, e.target.value)
                      }
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
        );

      case "storage":
        return <StorageSection apiBaseUrl={apiBaseUrl} />;

      case "plugins":
        return <PluginsSection apiBaseUrl={apiBaseUrl} />;

      case "queue":
        return <QueueSection apiBaseUrl={apiBaseUrl} />;

      case "about":
        return (
          <section className="settings-section">
            <h2>ℹ️ About</h2>
            <div className="about-info">
              <p>
                <strong>Mugiwara Manga Reader</strong>
              </p>
              <p>Version {pkg.version}</p>
              <p>
                A cross-platform manga reader with extensible plugin
                architecture.
              </p>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

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
        </div>
      </div>

      {error && (
        <div className="error-banner">
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      <div className="settings-layout">
        {/* Sidebar Navigation */}
        <nav className="settings-nav">
          <button
            className={`nav-item ${activeTab === "reading" ? "active" : ""}`}
            onClick={() => setActiveTab("reading")}
          >
            📖 Reading
          </button>
          <button
            className={`nav-item ${activeTab === "storage" ? "active" : ""}`}
            onClick={() => setActiveTab("storage")}
          >
            💾 Storage
          </button>
          <button
            className={`nav-item ${activeTab === "plugins" ? "active" : ""}`}
            onClick={() => setActiveTab("plugins")}
          >
            🔌 Plugins
          </button>
          <button
            className={`nav-item ${activeTab === "queue" ? "active" : ""}`}
            onClick={() => setActiveTab("queue")}
          >
            📥 Queue
          </button>
          <button
            className={`nav-item ${activeTab === "about" ? "active" : ""}`}
            onClick={() => setActiveTab("about")}
          >
            ℹ️ About
          </button>
        </nav>

        {/* Main Content */}
        <div className="settings-content">{renderTabContent()}</div>
      </div>
    </div>
  );
}
