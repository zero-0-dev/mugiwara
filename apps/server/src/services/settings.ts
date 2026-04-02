import { join } from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';

const SETTINGS_FILE = join(process.env.DATA_DIR || join(process.cwd(), 'data'), 'settings.json');

interface Settings {
  libraryDirectories: string[];
}

const defaultSettings: Settings = {
  libraryDirectories: [],
};

export async function loadSettings(): Promise<Settings> {
  try {
    if (!existsSync(SETTINGS_FILE)) {
      return { ...defaultSettings };
    }
    const data = await readFile(SETTINGS_FILE, 'utf-8');
    return { ...defaultSettings, ...JSON.parse(data) };
  } catch (error) {
    console.error('Error loading settings:', error);
    return { ...defaultSettings };
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  try {
    const dir = join(SETTINGS_FILE, '..');
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving settings:', error);
    throw error;
  }
}

export async function getLibraryDirectories(): Promise<string[]> {
  const settings = await loadSettings();
  return settings.libraryDirectories;
}

export async function setLibraryDirectories(directories: string[]): Promise<void> {
  const settings = await loadSettings();
  settings.libraryDirectories = directories;
  await saveSettings(settings);
}
