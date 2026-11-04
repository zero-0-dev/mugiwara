import { isCapacitor } from "./server";

let warned = false;

/**
 * Light impact feedback on a page turn. The plugin is optional: the dynamic
 * import keeps it out of the browser bundle path (and it is a no-op there),
 * and any native failure is swallowed so reading never breaks.
 *
 * Native note: `@capacitor/haptics` must be present in apps/mobile and a
 * `cap sync`/native build has to run for the native implementation to be
 * installed. Its absence only removes haptics.
 */
export async function hapticPageTurn(enabled: boolean): Promise<void> {
  if (!enabled || !isCapacitor()) return;

  try {
    const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    if (!warned) {
      warned = true;
      console.warn("Haptics unavailable; continuing without page-turn feedback.");
    }
  }
}
