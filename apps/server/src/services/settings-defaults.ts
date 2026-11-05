// Single source of truth for server-side setting defaults.
//
// Both the settings service and the settings API import this map so a new
// setting cannot exist in one list but be missing from the other.
export const defaultSettings: Record<string, string> = {
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

  // Download preferences
  "download.compressImages": "true",
};
