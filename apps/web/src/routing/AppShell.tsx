import React, { useRef } from "react";
import { BookOpen, Compass, Settings } from "lucide-react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/button";
import { MobileTabBar } from "../components/MobileTabBar";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useNativeNavigation } from "../hooks/useNativeNavigation";
import { useAppChrome } from "./appChrome";
import { getLastLibraryPath } from "./librarySearch";
import { useScrollRestoration } from "./scrollRestoration";
import brandMark from "../assets/mugiwara-mark.png";
import { cn } from "@/lib/utils";

function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src={brandMark}
      alt=""
      aria-hidden="true"
      className={cn(
        "size-8 shrink-0 rounded-lg object-cover shadow-sm shadow-orange-950/40",
        className,
      )}
    />
  );
}

function NavButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-primary/15 text-brand-text"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}

/**
 * The single application frame for every route: desktop header, the scrollable
 * content region, native back/deep-link wiring and the mobile tab bar. Reader
 * routes are full-screen and render neither chrome.
 */
export function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const mainRef = useRef<HTMLElement>(null);
  const { serverLabel } = useAppChrome();

  useScrollRestoration(mainRef);
  useNativeNavigation();
  useKeyboardShortcuts([
    {
      key: ",",
      ctrl: true,
      action: () => navigate("/settings"),
    },
  ]);

  const isReader = location.pathname.startsWith("/read/");
  const isLibrarySection =
    location.pathname === "/" || location.pathname.startsWith("/manga/");
  const isDiscoverSection = location.pathname.startsWith("/discover");
  const isSettingsSection = location.pathname.startsWith("/settings");

  return (
    <div className="flex h-dvh min-h-0 flex-col bg-background text-foreground">
      {!isReader && (
        <header className="electron-drag z-40 hidden shrink-0 border-b border-border/70 bg-background/85 pt-[env(safe-area-inset-top)] backdrop-blur-xl sm:block">
          <div className="mx-auto flex h-14 w-full max-w-7xl items-center gap-3 px-4 pl-[max(1rem,var(--titlebar-inset-left),env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))]">
            <button
              onClick={() => navigate(getLastLibraryPath())}
              className="electron-no-drag flex items-center gap-2.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Mugiwara home"
            >
              <BrandMark />
              <span className="text-base font-semibold tracking-tight">
                Mugiwara
              </span>
            </button>

            <nav className="electron-no-drag ml-2 hidden items-center gap-1 sm:flex">
              <NavButton
                active={isLibrarySection}
                onClick={() => navigate(getLastLibraryPath())}
                icon={<BookOpen className="size-4" />}
              >
                Library
              </NavButton>
              <NavButton
                active={isDiscoverSection}
                onClick={() => navigate("/discover")}
                icon={<Compass className="size-4" />}
              >
                Discover
              </NavButton>
            </nav>

            <div className="electron-no-drag ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-success-text md:inline-flex">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                {serverLabel || "local"}
              </span>
              <Button
                variant={isSettingsSection ? "secondary" : "ghost"}
                size="icon"
                onClick={() => navigate("/settings")}
                title="Settings"
                aria-label="Settings"
                aria-current={isSettingsSection ? "page" : undefined}
              >
                <Settings className="size-5" />
              </Button>
            </div>
          </div>
        </header>
      )}

      <main
        ref={mainRef}
        className={cn(
          "min-h-0 flex-1",
          isReader ? "overflow-hidden" : "overflow-y-auto scrollbar-thin",
          !isReader &&
            "pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] sm:pb-0 sm:pt-0",
        )}
      >
        <Outlet />
      </main>

      {!isReader && <MobileTabBar />}
    </div>
  );
}
