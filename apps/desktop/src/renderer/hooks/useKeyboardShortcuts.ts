import { useEffect } from "react";

interface Shortcut {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  action: () => void;
  enabled?: boolean;
}

export function useKeyboardShortcuts(shortcuts: Shortcut[]) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      for (const s of shortcuts) {
        if (
          e.key === s.key &&
          !!s.ctrl === (e.ctrlKey || e.metaKey) &&
          !!s.shift === e.shiftKey &&
          s.enabled !== false
        ) {
          e.preventDefault();
          s.action();
          return;
        }
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
