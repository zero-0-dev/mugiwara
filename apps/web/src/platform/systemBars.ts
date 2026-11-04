import { isCapacitor } from "./server";

/**
 * Hide/show the native status and navigation bars while the reader is
 * immersive. SystemBars ships inside @capacitor/core (Capacitor 8+), so no
 * native sync is needed. It is a no-op in a normal browser.
 */
export async function setSystemBarsHidden(hidden: boolean): Promise<void> {
  if (!isCapacitor()) return;

  try {
    const { SystemBars } = await import("@capacitor/core");
    if (hidden) {
      await SystemBars.hide();
    } else {
      await SystemBars.show();
    }
  } catch {
    // Older Capacitor builds or a missing native implementation: the reader
    // still works, only the system bars stay visible.
  }
}
