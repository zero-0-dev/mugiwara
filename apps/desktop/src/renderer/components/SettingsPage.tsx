import React from "react";
import { ArrowLeft } from "lucide-react";
import { useToast } from "./Toast";
import { StorageSection } from "./settings/StorageSection";
import { PluginsSection } from "./settings/PluginsSection";
import { QueueSection } from "./settings/QueueSection";
import { useSettings, useSaveSetting } from "../api/hooks";
import pkg from "../../../package.json";
import { Select } from "./Select";

interface SettingsPageProps {
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

export function SettingsPage({ onBack }: SettingsPageProps) {
  const [activeTab, setActiveTab] = React.useState<string>("reading");
  const { data: serverSettings, isLoading, isError, error } = useSettings();
  const saveSetting = useSaveSetting();
  const toast = useToast();
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(null), 2000);
      return () => clearTimeout(timer);
    }
  }, [saveSuccess]);

  const settings: Settings = { ...defaultSettings, ...(serverSettings as Partial<Settings>) };

  function updateSetting(key: keyof Settings, value: string) {
    saveSetting.mutate(
      { key, value },
      {
        onSuccess: () => setSaveSuccess("Saved"),
        onError: (err) => toast.error(err instanceof Error ? err.message : "Failed to save"),
      },
    );
  }

  const renderTabContent = () => {
    switch (activeTab) {
      case "reading":
        return (
          <section className="settings-section">
            <h2>Reading Preferences</h2>

            <div className="setting-item">
              <div className="setting-info">
                <label>Theme</label>
                <p>Choose between dark and light appearance</p>
              </div>
              <div className="setting-control">
                <Select
                  value={settings["ui.theme"]}
                  onChange={(v) => updateSetting("ui.theme", v)}
                  disabled={saveSetting.isPending}
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
                {saveSetting.isPending && <span className="saving-indicator">Saving...</span>}
              </div>
            </div>

            <div className="setting-item">
              <div className="setting-info">
                <label>Default Reading Mode</label>
                <p>Used when no specific mode is set for a media type</p>
              </div>
              <div className="setting-control">
                <Select
                  value={settings["reading.defaultMode"]}
                  onChange={(v) => updateSetting("reading.defaultMode", v)}
                  disabled={saveSetting.isPending}
                  options={readingModes.map((mode) => ({
                    value: mode.value,
                    label: mode.label,
                  }))}
                />
                {saveSetting.isPending && <span className="saving-indicator">Saving...</span>}
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
                    <Select
                      value={settings[settingKey]}
                      onChange={(v) => updateSetting(settingKey, v)}
                      disabled={saveSetting.isPending}
                      options={readingModes.map((mode) => ({
                        value: mode.value,
                        label: mode.label,
                      }))}
                    />
                    {saveSetting.isPending && <span className="saving-indicator">Saving...</span>}
                  </div>
                </div>
              );
            })}
          </section>
        );

      case "storage":
        return <StorageSection />;

      case "plugins":
        return <PluginsSection />;

      case "queue":
        return <QueueSection />;

      case "about":
        return (
          <section className="settings-section">
            <h2>About</h2>
            <div className="about-info">
              <p><strong>Mugiwara Manga Reader</strong></p>
              <p>Version {pkg.version}</p>
              <p>A cross-platform manga reader with extensible plugin architecture.</p>
            </div>
          </section>
        );

      default:
        return null;
    }
  };

  if (isLoading) {
    return (
      <div className="settings-page">
        <div className="settings-loading">
          <div className="loading-spinner"></div>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="settings-page">
        <div className="error-container">
          <h3>Failed to load settings</h3>
          <p>{(error as Error)?.message || "Unable to connect to server. Please try again."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button onClick={onBack} className="btn btn-secondary back-btn">
          <ArrowLeft size={16} /> Back
        </button>
        <h1>Settings</h1>
        <div className="header-actions">
          {saveSuccess && <span className="save-indicator">{saveSuccess}</span>}
        </div>
      </div>

      <div className="settings-layout">
        <nav className="settings-nav">
          <button className={`nav-item ${activeTab === "reading" ? "active" : ""}`} onClick={() => setActiveTab("reading")}>
            Reading
          </button>
          <button className={`nav-item ${activeTab === "storage" ? "active" : ""}`} onClick={() => setActiveTab("storage")}>
            Storage
          </button>
          <button className={`nav-item ${activeTab === "plugins" ? "active" : ""}`} onClick={() => setActiveTab("plugins")}>
            Plugins
          </button>
          <button className={`nav-item ${activeTab === "queue" ? "active" : ""}`} onClick={() => setActiveTab("queue")}>
            Queue
          </button>
          <button className={`nav-item ${activeTab === "about" ? "active" : ""}`} onClick={() => setActiveTab("about")}>
            About
          </button>
        </nav>

        <div className="settings-content">{renderTabContent()}</div>
      </div>
    </div>
  );
}
