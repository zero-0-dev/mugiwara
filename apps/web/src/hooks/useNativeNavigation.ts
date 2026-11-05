import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../components/Toast";
import { registerAndroidBackButton } from "../platform/backButton";
import {
  getInitialDeepLinkPath,
  registerDeepLinkHandler,
} from "../platform/deepLinks";
import { isCapacitor } from "../platform/server";

/**
 * Native navigation for the Capacitor shell: Android back maps to web history,
 * a second press at the root exits, and app links/deep links resolve to routes.
 *
 * Runs only on native. Browser and Electron already get history and URLs from
 * the router.
 */
export function useNativeNavigation(): void {
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!isCapacitor()) return undefined;

    let disposed = false;
    void getInitialDeepLinkPath().then((path) => {
      if (!disposed && path && path !== window.location.pathname) {
        navigate(path, { replace: true });
      }
    });

    const removeBackListener = registerAndroidBackButton({
      isRoot: () => window.location.pathname === "/",
      onNavigateHome: () => navigate("/", { replace: true }),
      onExitPrompt: () =>
        toast("Press back again to exit", "info"),
    });
    const removeDeepLinkListener = registerDeepLinkHandler((path) => {
      navigate(path);
    });

    return () => {
      disposed = true;
      removeBackListener();
      removeDeepLinkListener();
    };
  }, [navigate, toast]);
}
