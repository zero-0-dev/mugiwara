/**
 * Theme catalog
 * -------------
 * Every theme family ships a light and a dark variant. A variant expands into
 * the semantic tokens consumed by `index.css`, so components never need to know
 * which palette is active.
 *
 * The setting stored on the server (`ui.theme`) is the variant id, for example
 * `mugiwara-dark`. The palettes are applied as CSS custom properties on
 * `<html>`; the values in `index.css` are only the first-paint fallback.
 */

export type ThemeMode = "light" | "dark";

export const THEME_STORAGE_KEY = "mugiwara.theme";

/** Colors every variant supplies. The rest of the palette is derived. */
export interface ThemeColors {
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  destructive: string;
  success: string;
  warning: string;
  border: string;
  input: string;
  ring: string;
}

/** Full token set written to the document. */
export interface ThemePalette extends ThemeColors {
  cardForeground: string;
  popoverForeground: string;
  destructiveForeground: string;
  brand: string;
  brandHover: string;
  brandSoft: string;
  brandText: string;
  successText: string;
  warningText: string;
  destructiveText: string;
}

export interface ThemeVariant {
  id: string;
  familyId: string;
  mode: ThemeMode;
  palette: ThemePalette;
  /** Browser chrome / PWA status-bar color. */
  chrome: string;
}

export interface ThemeFamily {
  id: string;
  name: string;
  description: string;
  light: ThemeVariant;
  dark: ThemeVariant;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels
    .map((channel) =>
      Math.max(0, Math.min(255, Math.round(channel)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

/** Mixes `to` into `from`; `weight` is 0..1. */
function mix(from: string, to: string, weight: number): string {
  const a = parseHex(from);
  const b = parseHex(to);
  return toHex([
    a[0] * (1 - weight) + b[0] * weight,
    a[1] * (1 - weight) + b[1] * weight,
    a[2] * (1 - weight) + b[2] * weight,
  ]);
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = parseHex(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function expandPalette(mode: ThemeMode, colors: ThemeColors): ThemePalette {
  const contrast = mode === "dark" ? "#ffffff" : "#000000";
  const textWeight = mode === "dark" ? 0.35 : 0.2;

  return {
    ...colors,
    cardForeground: colors.foreground,
    popoverForeground: colors.foreground,
    destructiveForeground: "#ffffff",
    brand: colors.primary,
    brandHover: mix(colors.primary, contrast, mode === "dark" ? 0.12 : 0.18),
    brandSoft: withAlpha(colors.primary, mode === "dark" ? 0.18 : 0.12),
    brandText: mix(colors.primary, contrast, textWeight),
    successText: mix(colors.success, contrast, textWeight),
    warningText: mix(colors.warning, contrast, textWeight),
    destructiveText: mix(colors.destructive, contrast, textWeight),
  };
}

function buildVariant(
  familyId: string,
  mode: ThemeMode,
  colors: ThemeColors,
): ThemeVariant {
  const palette = expandPalette(mode, colors);
  return {
    id: `${familyId}-${mode}`,
    familyId,
    mode,
    palette,
    chrome: palette.background,
  };
}

function family(
  id: string,
  name: string,
  description: string,
  light: ThemeColors,
  dark: ThemeColors,
): ThemeFamily {
  return {
    id,
    name,
    description,
    light: buildVariant(id, "light", light),
    dark: buildVariant(id, "dark", dark),
  };
}

export const THEME_FAMILIES: ThemeFamily[] = [
  family(
    "mugiwara",
    "Mugiwara",
    "Straw-hat orange, gold and warm ink.",
    {
      background: "#faf1e2",
      foreground: "#2b1d12",
      card: "#fffaf2",
      popover: "#fffdf9",
      primary: "#c2410c",
      primaryForeground: "#ffffff",
      secondary: "#f2e0c6",
      secondaryForeground: "#332214",
      muted: "#f6ead6",
      mutedForeground: "#6f5a45",
      accent: "#f0dec4",
      accentForeground: "#2b1d12",
      destructive: "#b93a24",
      success: "#3f7d20",
      warning: "#b45309",
      border: "#e8d5b9",
      input: "#ddc6a6",
      ring: "#c2410c",
    },
    {
      background: "#17120e",
      foreground: "#f8efe2",
      card: "#221a14",
      popover: "#281f18",
      primary: "#f39413",
      primaryForeground: "#201204",
      secondary: "#33261b",
      secondaryForeground: "#f8efe2",
      muted: "#2c2119",
      mutedForeground: "#b9a58f",
      accent: "#3a2a1d",
      accentForeground: "#f8efe2",
      destructive: "#ef4444",
      success: "#6fae4f",
      warning: "#d2ab56",
      border: "#3b2c1f",
      input: "#463424",
      ring: "#f39413",
    },
  ),
  family(
    "classic",
    "Classic",
    "The original Mugiwara indigo palette.",
    {
      background: "#f4f1ed",
      foreground: "#26231f",
      card: "#fbfaf8",
      popover: "#ffffff",
      primary: "#4f46e5",
      primaryForeground: "#ffffff",
      secondary: "#eae4dd",
      secondaryForeground: "#332f2b",
      muted: "#eee9e3",
      mutedForeground: "#736c64",
      accent: "#e7e1d9",
      accentForeground: "#26231f",
      destructive: "#dc2626",
      success: "#16a34a",
      warning: "#d97706",
      border: "#e0d8cf",
      input: "#d9d0c6",
      ring: "#4f46e5",
    },
    {
      background: "#171717",
      foreground: "#f7f7f8",
      card: "#222224",
      popover: "#242427",
      primary: "#6366f1",
      primaryForeground: "#ffffff",
      secondary: "#303034",
      secondaryForeground: "#f7f7f8",
      muted: "#29292c",
      mutedForeground: "#a1a1aa",
      accent: "#303034",
      accentForeground: "#f7f7f8",
      destructive: "#ef4444",
      success: "#22c55e",
      warning: "#f59e0b",
      border: "#34343a",
      input: "#3b3b42",
      ring: "#6366f1",
    },
  ),
  family(
    "catppuccin",
    "Catppuccin",
    "Soft pastel comfort in Latte and Mocha.",
    {
      background: "#eff1f5",
      foreground: "#4c4f69",
      card: "#e6e9ef",
      popover: "#ffffff",
      primary: "#8839ef",
      primaryForeground: "#ffffff",
      secondary: "#ccd0da",
      secondaryForeground: "#4c4f69",
      muted: "#e6e9ef",
      mutedForeground: "#6c6f85",
      accent: "#dce0e8",
      accentForeground: "#4c4f69",
      destructive: "#d20f39",
      success: "#40a02b",
      warning: "#df8e1d",
      border: "#ccd0da",
      input: "#bcc0cc",
      ring: "#8839ef",
    },
    {
      background: "#1e1e2e",
      foreground: "#cdd6f4",
      card: "#181825",
      popover: "#181825",
      primary: "#cba6f7",
      primaryForeground: "#1e1e2e",
      secondary: "#313244",
      secondaryForeground: "#cdd6f4",
      muted: "#313244",
      mutedForeground: "#a6adc8",
      accent: "#45475a",
      accentForeground: "#cdd6f4",
      destructive: "#f38ba8",
      success: "#a6e3a1",
      warning: "#f9e2af",
      border: "#313244",
      input: "#45475a",
      ring: "#cba6f7",
    },
  ),
  family(
    "tokyo-night",
    "Tokyo Night",
    "Neon city blues, Day and Night.",
    {
      background: "#e1e2e7",
      foreground: "#3760bf",
      card: "#f2f3f7",
      popover: "#ffffff",
      primary: "#2e7de9",
      primaryForeground: "#ffffff",
      secondary: "#d0d5e3",
      secondaryForeground: "#3760bf",
      muted: "#e9eaf0",
      mutedForeground: "#6172b0",
      accent: "#d8dbe8",
      accentForeground: "#3760bf",
      destructive: "#f52a65",
      success: "#587539",
      warning: "#8c6c3e",
      border: "#c4c8da",
      input: "#b7bcd1",
      ring: "#2e7de9",
    },
    {
      background: "#1a1b26",
      foreground: "#c0caf5",
      card: "#16161e",
      popover: "#1f2335",
      primary: "#7aa2f7",
      primaryForeground: "#15161e",
      secondary: "#292e42",
      secondaryForeground: "#c0caf5",
      muted: "#1f2335",
      mutedForeground: "#a9b1d6",
      accent: "#292e42",
      accentForeground: "#c0caf5",
      destructive: "#f7768e",
      success: "#9ece6a",
      warning: "#e0af68",
      border: "#292e42",
      input: "#3b4261",
      ring: "#7aa2f7",
    },
  ),
  family(
    "dracula",
    "Dracula",
    "Vivid purple on deep charcoal, Alucard and Dracula.",
    {
      background: "#fffbeb",
      foreground: "#1f1f1f",
      card: "#f5f0e1",
      popover: "#fffdf7",
      primary: "#644ac9",
      primaryForeground: "#ffffff",
      secondary: "#e5e1cf",
      secondaryForeground: "#1f1f1f",
      muted: "#f1ecd9",
      mutedForeground: "#6c664b",
      accent: "#e3ddc9",
      accentForeground: "#1f1f1f",
      destructive: "#cb3a2a",
      success: "#14710a",
      warning: "#846e15",
      border: "#d8d3bf",
      input: "#cbc6b2",
      ring: "#644ac9",
    },
    {
      background: "#282a36",
      foreground: "#f8f8f2",
      card: "#21222c",
      popover: "#343746",
      primary: "#bd93f9",
      primaryForeground: "#282a36",
      secondary: "#44475a",
      secondaryForeground: "#f8f8f2",
      muted: "#343746",
      mutedForeground: "#a8a9ba",
      accent: "#44475a",
      accentForeground: "#f8f8f2",
      destructive: "#ff5555",
      success: "#50fa7b",
      warning: "#f1fa8c",
      border: "#44475a",
      input: "#525566",
      ring: "#bd93f9",
    },
  ),
  family(
    "synthwave",
    "Synthwave",
    "Retro neon pink, violet and midnight.",
    {
      background: "#f7f1ff",
      foreground: "#2d1b4e",
      card: "#fffaff",
      popover: "#ffffff",
      primary: "#c0269f",
      primaryForeground: "#ffffff",
      secondary: "#ecd9ff",
      secondaryForeground: "#3c235f",
      muted: "#f1e6ff",
      mutedForeground: "#6b4f8f",
      accent: "#e8d7ff",
      accentForeground: "#2d1b4e",
      destructive: "#d92b3a",
      success: "#128a5a",
      warning: "#a86b00",
      border: "#e0ccf7",
      input: "#d2b8ee",
      ring: "#c0269f",
    },
    {
      background: "#241b2f",
      foreground: "#f0e6ff",
      card: "#2a2139",
      popover: "#34294f",
      primary: "#ff7edb",
      primaryForeground: "#241b2f",
      secondary: "#463465",
      secondaryForeground: "#f0e6ff",
      muted: "#34294f",
      mutedForeground: "#b6a7d0",
      accent: "#463465",
      accentForeground: "#f0e6ff",
      destructive: "#fe4450",
      success: "#72f1b8",
      warning: "#fede5d",
      border: "#463465",
      input: "#5a3f7a",
      ring: "#ff7edb",
    },
  ),
  family(
    "nord",
    "Nord",
    "Arctic blues and muted frost.",
    {
      background: "#eceff4",
      foreground: "#2e3440",
      card: "#e5e9f0",
      popover: "#ffffff",
      primary: "#5e81ac",
      primaryForeground: "#ffffff",
      secondary: "#d8dee9",
      secondaryForeground: "#2e3440",
      muted: "#e5e9f0",
      mutedForeground: "#4c566a",
      accent: "#d8dee9",
      accentForeground: "#2e3440",
      destructive: "#bf616a",
      success: "#5c7e4b",
      warning: "#b07d2b",
      border: "#d8dee9",
      input: "#c8d0dd",
      ring: "#5e81ac",
    },
    {
      background: "#2e3440",
      foreground: "#eceff4",
      card: "#3b4252",
      popover: "#434c5e",
      primary: "#88c0d0",
      primaryForeground: "#2e3440",
      secondary: "#434c5e",
      secondaryForeground: "#eceff4",
      muted: "#3b4252",
      mutedForeground: "#d8dee9",
      accent: "#434c5e",
      accentForeground: "#eceff4",
      destructive: "#bf616a",
      success: "#a3be8c",
      warning: "#ebcb8b",
      border: "#4c566a",
      input: "#4c566a",
      ring: "#88c0d0",
    },
  ),
  family(
    "gruvbox",
    "Gruvbox",
    "Warm retro earth tones.",
    {
      background: "#fbf1c7",
      foreground: "#3c3836",
      card: "#f2e5bc",
      popover: "#f9f5d7",
      primary: "#af3a03",
      primaryForeground: "#ffffff",
      secondary: "#ebdbb2",
      secondaryForeground: "#3c3836",
      muted: "#f2e5bc",
      mutedForeground: "#665c54",
      accent: "#ebdbb2",
      accentForeground: "#3c3836",
      destructive: "#9d0006",
      success: "#79740e",
      warning: "#b57614",
      border: "#d5c4a1",
      input: "#c9b99a",
      ring: "#af3a03",
    },
    {
      background: "#282828",
      foreground: "#ebdbb2",
      card: "#32302f",
      popover: "#3c3836",
      primary: "#fabd2f",
      primaryForeground: "#282828",
      secondary: "#3c3836",
      secondaryForeground: "#ebdbb2",
      muted: "#32302f",
      mutedForeground: "#bdae93",
      accent: "#504945",
      accentForeground: "#ebdbb2",
      destructive: "#fb4934",
      success: "#b8bb26",
      warning: "#fe8019",
      border: "#504945",
      input: "#665c54",
      ring: "#fabd2f",
    },
  ),
  family(
    "solarized",
    "Solarized",
    "Precision-balanced light and dark.",
    {
      background: "#fdf6e3",
      foreground: "#586e75",
      card: "#eee8d5",
      popover: "#fffbf0",
      primary: "#268bd2",
      primaryForeground: "#ffffff",
      secondary: "#eee8d5",
      secondaryForeground: "#586e75",
      muted: "#f5efdc",
      mutedForeground: "#657b83",
      accent: "#e6dfc8",
      accentForeground: "#586e75",
      destructive: "#dc322f",
      success: "#859900",
      warning: "#b58900",
      border: "#ddd6c1",
      input: "#d0c9b4",
      ring: "#268bd2",
    },
    {
      background: "#002b36",
      foreground: "#93a1a1",
      card: "#073642",
      popover: "#0b3c49",
      primary: "#268bd2",
      primaryForeground: "#fdf6e3",
      secondary: "#073642",
      secondaryForeground: "#93a1a1",
      muted: "#073642",
      mutedForeground: "#839496",
      accent: "#0f4652",
      accentForeground: "#eee8d5",
      destructive: "#dc322f",
      success: "#859900",
      warning: "#b58900",
      border: "#0f4652",
      input: "#15505e",
      ring: "#268bd2",
    },
  ),
  family(
    "rose-pine",
    "Rosé Pine",
    "Muted rose, gold and iris.",
    {
      background: "#faf4ed",
      foreground: "#575279",
      card: "#fffaf3",
      popover: "#ffffff",
      primary: "#907aa9",
      primaryForeground: "#ffffff",
      secondary: "#f2e9e1",
      secondaryForeground: "#575279",
      muted: "#f4ece4",
      mutedForeground: "#797593",
      accent: "#f2e9e1",
      accentForeground: "#575279",
      destructive: "#b4637a",
      success: "#56949f",
      warning: "#ea9d34",
      border: "#e6ddd4",
      input: "#dcd2c9",
      ring: "#907aa9",
    },
    {
      background: "#232136",
      foreground: "#e0def4",
      card: "#2a273f",
      popover: "#393552",
      primary: "#c4a7e7",
      primaryForeground: "#232136",
      secondary: "#393552",
      secondaryForeground: "#e0def4",
      muted: "#2a273f",
      mutedForeground: "#908caa",
      accent: "#393552",
      accentForeground: "#e0def4",
      destructive: "#eb6f92",
      success: "#9ccfd8",
      warning: "#f6c177",
      border: "#393552",
      input: "#44415a",
      ring: "#c4a7e7",
    },
  ),
  family(
    "github",
    "GitHub",
    "The familiar code-hosting grays and blue.",
    {
      background: "#ffffff",
      foreground: "#1f2328",
      card: "#f6f8fa",
      popover: "#ffffff",
      primary: "#0969da",
      primaryForeground: "#ffffff",
      secondary: "#eaeef2",
      secondaryForeground: "#1f2328",
      muted: "#f6f8fa",
      mutedForeground: "#59636e",
      accent: "#eaeef2",
      accentForeground: "#1f2328",
      destructive: "#d1242f",
      success: "#1a7f37",
      warning: "#9a6700",
      border: "#d1d9e0",
      input: "#c8d1da",
      ring: "#0969da",
    },
    {
      background: "#0d1117",
      foreground: "#e6edf3",
      card: "#161b22",
      popover: "#1c2128",
      primary: "#4493f8",
      primaryForeground: "#0d1117",
      secondary: "#21262d",
      secondaryForeground: "#e6edf3",
      muted: "#161b22",
      mutedForeground: "#8d96a0",
      accent: "#21262d",
      accentForeground: "#e6edf3",
      destructive: "#f85149",
      success: "#3fb950",
      warning: "#d29922",
      border: "#30363d",
      input: "#3d444d",
      ring: "#4493f8",
    },
  ),
  family(
    "matcha",
    "Matcha",
    "Fresh green-tea tones.",
    {
      background: "#f2f7ec",
      foreground: "#1d3324",
      card: "#fbfdf8",
      popover: "#ffffff",
      primary: "#3f7d45",
      primaryForeground: "#ffffff",
      secondary: "#dfeacf",
      secondaryForeground: "#243c29",
      muted: "#eaf2df",
      mutedForeground: "#5d7561",
      accent: "#dce9cc",
      accentForeground: "#1d3324",
      destructive: "#b83a30",
      success: "#3f7d45",
      warning: "#9c7413",
      border: "#d7e4c7",
      input: "#c9d9b6",
      ring: "#3f7d45",
    },
    {
      background: "#101a14",
      foreground: "#e7f2e7",
      card: "#17241c",
      popover: "#1d2d23",
      primary: "#6fbf73",
      primaryForeground: "#0c1710",
      secondary: "#24382b",
      secondaryForeground: "#e7f2e7",
      muted: "#1d2d23",
      mutedForeground: "#a3bda8",
      accent: "#2a4232",
      accentForeground: "#e7f2e7",
      destructive: "#e05a4f",
      success: "#6fbf73",
      warning: "#d7b75a",
      border: "#2a4232",
      input: "#35523d",
      ring: "#6fbf73",
    },
  ),
  family(
    "crimson",
    "Crimson",
    "Deep reds with warm embers.",
    {
      background: "#fdf1f1",
      foreground: "#3a1418",
      card: "#fffafa",
      popover: "#ffffff",
      primary: "#b91c34",
      primaryForeground: "#ffffff",
      secondary: "#f5d7dc",
      secondaryForeground: "#451a20",
      muted: "#f9e5e7",
      mutedForeground: "#7d5158",
      accent: "#f2d2d7",
      accentForeground: "#3a1418",
      destructive: "#b91c34",
      success: "#377d45",
      warning: "#9a6a13",
      border: "#efd0d4",
      input: "#e5bcc2",
      ring: "#b91c34",
    },
    {
      background: "#1a0f12",
      foreground: "#f8e8ea",
      card: "#241418",
      popover: "#2d181d",
      primary: "#e4475c",
      primaryForeground: "#1a0f12",
      secondary: "#3a1d24",
      secondaryForeground: "#f8e8ea",
      muted: "#2d181d",
      mutedForeground: "#c9a5ad",
      accent: "#46232b",
      accentForeground: "#f8e8ea",
      destructive: "#e4475c",
      success: "#5fa86f",
      warning: "#d8a24a",
      border: "#46232b",
      input: "#582d37",
      ring: "#e4475c",
    },
  ),
  family(
    "sakura",
    "Sakura",
    "Soft cherry-blossom pinks.",
    {
      background: "#fdf2f6",
      foreground: "#3b1c2b",
      card: "#fffafc",
      popover: "#ffffff",
      primary: "#c2185b",
      primaryForeground: "#ffffff",
      secondary: "#f7d9e5",
      secondaryForeground: "#471f31",
      muted: "#fae7ef",
      mutedForeground: "#7f5368",
      accent: "#f4d2e1",
      accentForeground: "#3b1c2b",
      destructive: "#b81f45",
      success: "#3f7d4c",
      warning: "#9c6c12",
      border: "#f0d3df",
      input: "#e7bece",
      ring: "#c2185b",
    },
    {
      background: "#1a1118",
      foreground: "#f9e9f1",
      card: "#241820",
      popover: "#2e1e29",
      primary: "#f48fb1",
      primaryForeground: "#1a1118",
      secondary: "#3a2433",
      secondaryForeground: "#f9e9f1",
      muted: "#2e1e29",
      mutedForeground: "#c9a3b5",
      accent: "#462b3e",
      accentForeground: "#f9e9f1",
      destructive: "#e05a70",
      success: "#7bb287",
      warning: "#d8aa5a",
      border: "#462b3e",
      input: "#58364d",
      ring: "#f48fb1",
    },
  ),
  family(
    "ocean",
    "Ocean",
    "Cool deep-sea blues and teals.",
    {
      background: "#eef7fb",
      foreground: "#123140",
      card: "#fbfeff",
      popover: "#ffffff",
      primary: "#0369a1",
      primaryForeground: "#ffffff",
      secondary: "#d6e9f2",
      secondaryForeground: "#163847",
      muted: "#e4f1f7",
      mutedForeground: "#517080",
      accent: "#d0e6f1",
      accentForeground: "#123140",
      destructive: "#c0362f",
      success: "#237a4d",
      warning: "#8c6410",
      border: "#cfe4ee",
      input: "#bed8e5",
      ring: "#0369a1",
    },
    {
      background: "#071620",
      foreground: "#e1f3f8",
      card: "#0c2130",
      popover: "#102a3d",
      primary: "#38bdf8",
      primaryForeground: "#071620",
      secondary: "#15354a",
      secondaryForeground: "#e1f3f8",
      muted: "#102a3d",
      mutedForeground: "#9ab8c7",
      accent: "#1a415a",
      accentForeground: "#e1f3f8",
      destructive: "#f26d6d",
      success: "#4cc38a",
      warning: "#e3b341",
      border: "#1a415a",
      input: "#244f6b",
      ring: "#38bdf8",
    },
  ),
  family(
    "sumi",
    "Sumi",
    "Classical manga ink, washi paper and vermilion.",
    {
      background: "#f4efe3",
      foreground: "#2b2620",
      card: "#fbf7ee",
      popover: "#fffdf7",
      primary: "#b23a2e",
      primaryForeground: "#ffffff",
      secondary: "#e7dfcf",
      secondaryForeground: "#332d26",
      muted: "#efe8da",
      mutedForeground: "#6b6153",
      accent: "#e5ddcc",
      accentForeground: "#2b2620",
      destructive: "#a8342a",
      success: "#4f6b3f",
      warning: "#8a6a1f",
      border: "#ddd3c0",
      input: "#cfc4af",
      ring: "#b23a2e",
    },
    {
      background: "#141311",
      foreground: "#ece5d8",
      card: "#1c1a16",
      popover: "#23201b",
      primary: "#d1493f",
      primaryForeground: "#1a0d0b",
      secondary: "#2b2721",
      secondaryForeground: "#ece5d8",
      muted: "#23201b",
      mutedForeground: "#a89e8e",
      accent: "#332e26",
      accentForeground: "#ece5d8",
      destructive: "#d1493f",
      success: "#7d9a6a",
      warning: "#c9a35a",
      border: "#332e26",
      input: "#403a30",
      ring: "#d1493f",
    },
  ),
];

export const THEME_VARIANTS: ThemeVariant[] = THEME_FAMILIES.flatMap(
  (theme) => [theme.light, theme.dark],
);

export const DEFAULT_THEME_ID = "mugiwara-dark";

/**
 * Before themes were selectable, `ui.theme` stored only the mode. Those values
 * now point at the new default palette in the same mode; the original palette
 * lives on as the "Classic" family.
 */
const LEGACY_THEME_ALIASES: Record<string, string> = {
  dark: "mugiwara-dark",
  light: "mugiwara-light",
};

export function resolveTheme(value: string | null | undefined): ThemeVariant {
  const normalized = (value ?? "").trim();
  const id = LEGACY_THEME_ALIASES[normalized] ?? normalized;

  const variant = THEME_VARIANTS.find((theme) => theme.id === id);
  if (variant) return variant;

  // Accept a family id on its own and default that family to dark.
  const byFamily = THEME_FAMILIES.find((theme) => theme.id === id);
  if (byFamily) return byFamily.dark;

  return (
    THEME_VARIANTS.find((theme) => theme.id === DEFAULT_THEME_ID) ??
    THEME_VARIANTS[0]!
  );
}

export type ThemeCssVariables = Record<`--${string}`, string>;

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
}

export function paletteToCssVariables(
  palette: ThemePalette,
): ThemeCssVariables {
  return Object.fromEntries(
    Object.entries(palette).map(([key, value]) => [
      `--${toKebabCase(key)}`,
      value,
    ]),
  ) as ThemeCssVariables;
}

/**
 * Applies a theme to the document and remembers it for the pre-paint pass in
 * `main.tsx`. Unknown values fall back to the default theme.
 */
export function applyTheme(value: string | null | undefined): ThemeVariant {
  const variant = resolveTheme(value);

  if (typeof document !== "undefined") {
    const root = document.documentElement;
    root.dataset.theme = variant.id;
    root.dataset.mode = variant.mode;
    root.style.setProperty("color-scheme", variant.mode);

    for (const [property, color] of Object.entries(
      paletteToCssVariables(variant.palette),
    )) {
      root.style.setProperty(property, color);
    }

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", variant.chrome);
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, variant.id);
  } catch {
    // Storage can be unavailable (private mode); the UI still works.
  }

  return variant;
}
