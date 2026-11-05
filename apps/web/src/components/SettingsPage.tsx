import React from "react";
import {
  ArrowLeft,
  BookOpen,
  Database,
  Download,
  Info,
  ListOrdered,
  Plug,
  ShieldCheck,
} from "lucide-react";
import { useToast } from "./Toast";
import { StorageSection } from "./settings/StorageSection";
import { PluginsSection } from "./settings/PluginsSection";
import { QueueSection } from "./settings/QueueSection";
import { SecuritySection } from "./settings/SecuritySection";
import { useSettings, useSaveSetting } from "../api/hooks";
import { useMobileLayout } from "../hooks/useMobileLayout";
import pkg from "../../package.json";
import brandMark from "../assets/mugiwara-mark.png";
import { Select } from "./Select";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Switch } from "./ui/switch";
import { Separator } from "./ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { cn } from "@/lib/utils";

interface SettingsPageProps {
  onBack: () => void;
  serverLabel?: string;
  onChangeServer?: () => void;
  onOpenDiskSpace?: () => void;
}

interface Settings {
  "reading.defaultMode": string;
  "reading.mangaMode": string;
  "reading.manhwaMode": string;
  "reading.manhuaMode": string;
  "reading.webtoonMode": string;
  "reader.haptics": string;
  "ui.theme": string;
  "download.compressImages": string;
}

const defaultSettings: Settings = {
  "reading.defaultMode": "rtl",
  "reading.mangaMode": "rtl",
  "reading.manhwaMode": "vertical",
  "reading.manhuaMode": "vertical",
  "reading.webtoonMode": "vertical",
  "reader.haptics": "false",
  "ui.theme": "dark",
  "download.compressImages": "true",
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

const TABS = [
  { value: "reading", label: "Reading", icon: BookOpen },
  { value: "downloads", label: "Downloads", icon: Download },
  { value: "storage", label: "Storage", icon: Database },
  { value: "plugins", label: "Plugins", icon: Plug },
  { value: "queue", label: "Queue", icon: ListOrdered },
  { value: "security", label: "Security", icon: ShieldCheck },
  { value: "about", label: "About", icon: Info },
];

export function SettingsPage({
  onBack,
  serverLabel,
  onChangeServer,
  onOpenDiskSpace,
}: SettingsPageProps) {
  const [activeTab, setActiveTab] = React.useState<string>("reading");
  const { data: serverSettings, isLoading } = useSettings();
  const saveSetting = useSaveSetting();
  const toast = useToast();
  const isMobile = useMobileLayout();
  const [saveSuccess, setSaveSuccess] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (saveSuccess) {
      const timer = setTimeout(() => setSaveSuccess(null), 2000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [saveSuccess]);

  const settings: Settings = {
    ...defaultSettings,
    ...(serverSettings as Partial<Settings>),
  };

  function updateSetting(key: keyof Settings, value: string) {
    saveSetting.mutate(
      { key, value },
      {
        onSuccess: () => setSaveSuccess("Saved"),
        onError: (err) =>
          toast.error(err instanceof Error ? err.message : "Failed to save"),
      },
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-3 px-4 py-24 text-muted-foreground">
        <div className="loading-spinner" />
        <p className="text-sm">Loading settings...</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-5 sm:px-6 sm:py-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label="Back"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Reading, downloads, storage, plugins and security.
            </p>
          </div>
        </div>
        {saveSuccess && (
          <Badge variant="success" role="status">
            {saveSuccess}
          </Badge>
        )}
      </div>

      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        orientation={isMobile ? "horizontal" : "vertical"}
        className="mt-6 flex flex-col gap-4 md:flex-row md:items-start md:gap-6"
      >
        <TabsList className="grid h-auto w-full shrink-0 grid-cols-2 gap-1 rounded-xl border border-border/80 bg-card p-1 shadow-sm sm:grid-cols-3 md:flex md:w-52 md:flex-col md:items-stretch md:justify-start">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="min-w-0 justify-center gap-2 rounded-lg px-2 py-2 data-[state=active]:bg-primary/15 data-[state=active]:text-brand-text data-[state=active]:shadow-none md:w-full md:justify-start md:px-3"
              >
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{tab.label}</span>
              </TabsTrigger>
            );
          })}
        </TabsList>

        <div className="min-w-0 flex-1">
          <TabsContent value="reading" className="mt-0">
            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="Reading Preferences"
                description="Choose how Mugiwara looks and how chapters turn."
              />

              <SettingRow
                label="Theme"
                description="Choose between dark and light appearance"
              >
                <Select
                  value={settings["ui.theme"]}
                  onChange={(v) => updateSetting("ui.theme", v)}
                  disabled={saveSetting.isPending}
                  aria-label="Theme"
                  className="w-36"
                  options={[
                    { value: "dark", label: "Dark" },
                    { value: "light", label: "Light" },
                  ]}
                />
              </SettingRow>

              <Separator />

              <SettingRow
                label="Page-turn haptics"
                description="Light vibration when a page settles. Native builds only; the web reader always stays silent."
              >
                <Switch
                  checked={settings["reader.haptics"] === "true"}
                  onCheckedChange={(checked) =>
                    updateSetting("reader.haptics", checked ? "true" : "false")
                  }
                  disabled={saveSetting.isPending}
                  aria-label="Page-turn haptics"
                />
              </SettingRow>

              <Separator />

              <SettingRow
                label="Default Reading Mode"
                description="Used when no specific mode is set for a media type"
              >
                <Select
                  value={settings["reading.defaultMode"]}
                  onChange={(v) => updateSetting("reading.defaultMode", v)}
                  disabled={saveSetting.isPending}
                  aria-label="Default reading mode"
                  className="w-52"
                  options={readingModes.map((mode) => ({
                    value: mode.value,
                    label: mode.label,
                  }))}
                />
              </SettingRow>

              <div className="mt-6">
                <h3 className="text-base font-semibold">
                  Reading Mode by Media Type
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Configure different reading modes for each type of manga.
                </p>
              </div>

              <div className="mt-2 divide-y divide-border/70">
                {mediaTypes.map(({ key, label, description }) => {
                  const settingKey = `reading.${key}Mode` as keyof Settings;
                  return (
                    <SettingRow
                      key={key}
                      label={label}
                      description={description}
                    >
                      <Select
                        value={settings[settingKey]}
                        onChange={(v) => updateSetting(settingKey, v)}
                        disabled={saveSetting.isPending}
                        aria-label={`${label} reading mode`}
                        className="w-52"
                        options={readingModes.map((mode) => ({
                          value: mode.value,
                          label: mode.label,
                        }))}
                      />
                    </SettingRow>
                  );
                })}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="downloads" className="mt-0">
            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="Downloads"
                description="Control how chapter pages are stored when downloading."
              />

              <Separator className="my-1" />

              <SettingRow
                label="Compress downloaded chapters"
                description="Re-encode downloaded pages to WebP to save disk space. Page order and dimensions are preserved. Existing downloads are not changed."
              >
                <Switch
                  checked={settings["download.compressImages"] === "true"}
                  onCheckedChange={(checked) =>
                    updateSetting(
                      "download.compressImages",
                      checked ? "true" : "false",
                    )
                  }
                  disabled={saveSetting.isPending}
                  aria-label="Compress downloaded chapters"
                />
              </SettingRow>
            </section>
          </TabsContent>

          <TabsContent value="storage" className="mt-0">
            <StorageSection onOpenDiskSpace={onOpenDiskSpace} />
          </TabsContent>
          <TabsContent value="plugins" className="mt-0">
            <PluginsSection />
          </TabsContent>
          <TabsContent value="queue" className="mt-0">
            <QueueSection />
          </TabsContent>
          <TabsContent value="security" className="mt-0">
            <SecuritySection />
          </TabsContent>
          <TabsContent value="about" className="mt-0">
            <section className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:p-6">
              <SectionHeading
                title="About"
                description="A cross-platform manga reader with an extensible plugin architecture."
              />
              <div className="mt-4 flex items-center gap-3 rounded-xl border border-border/70 bg-background/40 p-4">
                <img
                  src={brandMark}
                  alt=""
                  aria-hidden="true"
                  className="size-12 shrink-0 rounded-xl object-cover shadow-sm shadow-orange-950/40"
                />
                <div>
                  <p className="font-semibold">Mugiwara Manga Reader</p>
                  <p className="text-sm text-muted-foreground">
                    Version {pkg.version}
                  </p>
                </div>
              </div>
              <Separator className="my-4" />
              <SettingRow
                label="Server"
                description={serverLabel || "Same origin as the web client"}
              >
                {onChangeServer && (
                  <Button variant="outline" size="sm" onClick={onChangeServer}>
                    Change server
                  </Button>
                )}
              </SettingRow>
            </section>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 pr-4">
        <p className="text-sm font-medium">{label}</p>
        <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
      </div>
      <div className={cn("shrink-0", !children && "hidden")}>{children}</div>
    </div>
  );
}
