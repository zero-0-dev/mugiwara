import { db, settings } from "../database";
import { eq } from "drizzle-orm";
import { defaultSettings } from "./settings-defaults";

export { defaultSettings };

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
