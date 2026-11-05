import {
  BookOpen,
  Compass,
  Download,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { useLibrary, useQueueStats } from "../api/hooks";
import { Badge } from "./ui/badge";
import { getLastLibraryPath } from "../routing/librarySearch";
import { cn } from "@/lib/utils";

interface TabItem {
  key: string;
  label: string;
  to: string;
  icon: LucideIcon;
  active: boolean;
  badge: number;
  badgeLabel: string;
}

function formatBadge(count: number): string {
  return count > 99 ? "99+" : String(count);
}

function isSettingsTab(pathname: string, tab: string): boolean {
  return pathname === `/settings/${tab}` || pathname.startsWith(`/settings/${tab}/`);
}

/**
 * Mobile primary navigation. Every target is a real URL, so hardware back,
 * browser back and deep links behave the same as in the desktop header.
 */
export function MobileTabBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: queueStats } = useQueueStats();
  const { data: unreadTitles } = useLibrary({
    readingStatus: "not-started",
  });

  const stats = (queueStats ?? {}) as {
    pending?: number;
    running?: number;
    queued?: number;
    downloading?: number;
  };
  const activeDownloads =
    (stats.pending ?? stats.queued ?? 0) +
    (stats.running ?? stats.downloading ?? 0);
  const unreadCount = unreadTitles?.length ?? 0;
  const { pathname } = location;

  const tabs: TabItem[] = [
    {
      key: "library",
      label: "Library",
      to: getLastLibraryPath(),
      icon: BookOpen,
      active: pathname === "/" || pathname.startsWith("/manga/"),
      badge: unreadCount,
      badgeLabel: "unread titles",
    },
    {
      key: "discover",
      label: "Discover",
      to: "/discover",
      icon: Compass,
      active: pathname === "/discover" || pathname.startsWith("/discover/"),
      badge: 0,
      badgeLabel: "",
    },
    {
      key: "downloads",
      label: "Downloads",
      to: "/settings/queue",
      icon: Download,
      active: isSettingsTab(pathname, "queue"),
      badge: activeDownloads,
      badgeLabel: "active downloads",
    },
    {
      key: "settings",
      label: "Settings",
      to: "/settings",
      icon: Settings,
      active:
        (pathname.startsWith("/settings") &&
          !isSettingsTab(pathname, "queue")) ||
        pathname === "/disk-space",
      badge: 0,
      badgeLabel: "",
    },
  ];

  return (
    <nav
      aria-label="Primary"
      className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/95 pt-1.5 backdrop-blur-xl sm:hidden"
    >
      <div className="mx-auto flex max-w-md items-stretch">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => navigate(tab.to)}
              aria-current={tab.active ? "page" : undefined}
              aria-label={tab.label}
              title={
                tab.badge > 0
                  ? `${tab.label} — ${formatBadge(tab.badge)} ${tab.badgeLabel}`
                  : tab.label
              }
              className={cn(
                "relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[11px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                tab.active
                  ? "text-brand-text"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="relative">
                <Icon className="size-5" />
                {tab.badge > 0 && (
                  <Badge
                    aria-hidden="true"
                    className="absolute -right-2.5 -top-2 h-4 min-w-4 justify-center px-1 text-[10px] leading-none"
                  >
                    {formatBadge(tab.badge)}
                  </Badge>
                )}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
