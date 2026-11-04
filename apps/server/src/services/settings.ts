import { db, settings } from "../database";
import { eq } from "drizzle-orm";

// Default settings
const defaultSettings: Record<string, string> = {
  // Reading preferences
  "reading.defaultMode": "rtl",
  "reading.mangaMode": "rtl",
  "reading.manhwaMode": "vertical",
  "reading.manhuaMode": "vertical",
  "reading.webtoonMode": "vertical",

  // Reader preferences
  "reader.haptics": "false",

  // UI preferences
  "ui.theme": "dark",
  "ui.showNSFW": "false",

  // Library preferences
  "library.autoScan": "false",
  "library.autoRefreshMetadata": "false",
};

export async function getSetting(key: string): Promise<string | null> {
  try {
    const setting = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });

    if (setting) {
      return setting.value;
    }

    // Return default if exists
    if (key in defaultSettings) {
      return defaultSettings[key] ?? null;
    }

    return null;
  } catch (error) {
    console.error(`Error fetching setting ${key}:`, error);
    return defaultSettings[key] || null;
  }
}

export async function getBooleanSetting(key: string): Promise<boolean> {
  const value = await getSetting(key);
  return value === "true";
}

export async function setSetting(key: string, value: string): Promise<void> {
  try {
    const existing = await db.query.settings.findFirst({
      where: eq(settings.key, key),
    });

    if (existing) {
      await db
        .update(settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(settings.key, key));
    } else {
      await db.insert(settings).values({
        key,
        value,
        updatedAt: new Date().toISOString(),
      });
    }
  } catch (error) {
    console.error(`Error saving setting ${key}:`, error);
    throw error;
  }
}

// Re-export file-based settings for backward compatibility
export {
  loadSettings,
  saveSettings,
  getLibraryDirectories,
  setLibraryDirectories,
} from "./settings-file";
