export const DEFAULT_CATEGORY_COLOR = "#6366f1";

const HEX_COLOR = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

/**
 * Categories created before colors were supported (or with an invalid value)
 * fall back to the brand indigo so chips and swatches always render.
 */
export function normalizeCategoryColor(color?: string | null): string {
  const value = color?.trim();
  if (!value || !HEX_COLOR.test(value)) return DEFAULT_CATEGORY_COLOR;
  if (value.length === 4) {
    const [r, g, b] = value.slice(1).split("");
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return value.toLowerCase();
}

/**
 * Picks black or white text for a colored background using the WCAG relative
 * luminance threshold, so category chips stay readable in both themes.
 */
export function categoryTextColor(
  color?: string | null,
): "#000000" | "#ffffff" {
  const hex = normalizeCategoryColor(color);
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const linear = (channel: number) =>
    channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);

  const luminance =
    0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);

  return luminance > 0.45 ? "#000000" : "#ffffff";
}
