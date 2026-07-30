"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useNav } from "@/lib/nav-store";
import { LemniscateMark } from "@/components/ui/brand-loader";
import { cn } from "@/lib/utils";
import {
  HardDrive,
  LifeBuoy,
  LogOut,
  Search,
  Settings as SettingsIcon,
  User as UserIcon,
  BookOpen,
  Upload as UploadIcon,
  LayoutDashboard,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Breadcrumbs, type Crumb } from "./breadcrumbs";
import { useReaderSettings } from "@/hooks/use-reader-settings";

type NavItem = { view: ReturnType<typeof useNav.getState>["view"]; label: string; icon: any };

const PRIMARY_NAV: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "library", label: "Library", icon: BookOpen },
  { view: "upload", label: "Import", icon: UploadIcon },
  { view: "settings", label: "Settings", icon: SettingsIcon },
];

function openSearch() {
  if (typeof window !== "undefined") {
    useNav.getState().go("search");
  }
}

export function AppHeader({
  breadcrumbs,
  right,
  className,
}: {
  breadcrumbs?: Crumb[];
  right?: ReactNode;
  className?: string;
}) {
  const { view, go, reset } = useNav();
  const { settings } = useReaderSettings();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (v: string) => view === v;

  // In dashboard-noir scope, the header should adopt the noir palette
  const isNoir = view === "dashboard" || view === "library" || view === "upload" ||
    view === "settings" || view === "account" || view === "analytics" || view === "history" ||
    view === "search";

  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b backdrop-blur-md transition-colors",
        isNoir
          ? "border-[#262626] bg-[#0d0d0d]/80"
          : "border-border/60 bg-background/70",
        scrolled && "shadow-sm",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => go("landing")}
            className="focus-ring group flex items-center gap-2 rounded-md"
            aria-label="Lemniscate home"
          >
            <LemniscateMark
              className={cn(
                "h-5 w-8 shrink-0 transition-transform duration-300 group-hover:scale-105",
                isNoir ? "text-[var(--noir-gold)]" : "text-brand",
              )}
            />
            <span className="text-sm font-semibold tracking-tight">Lemniscate</span>
          </button>
          <nav aria-label="Primary" className="ml-2 hidden gap-1 md:flex">
            {PRIMARY_NAV.map((item) => {
              const active = isActive(item.view);
              return (
                <button
                  key={item.view}
                  onClick={() => go(item.view)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition",
                    active
                      ? isNoir
                        ? "font-medium text-[var(--noir-gold-soft)]"
                        : "font-medium text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
          <div className="ml-2 hidden md:block">
            <Breadcrumbs items={breadcrumbs} />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {right}
          <button
            onClick={openSearch}
            className={cn(
              "focus-ring inline-flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs transition",
              isNoir
                ? "border-[#262626] text-[var(--noir-ink-mute)] hover:text-[var(--noir-ink)]"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Search</span>
          </button>

          {/* Profile dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "focus-ring flex size-8 items-center justify-center rounded-full text-xs font-semibold uppercase transition",
                  isNoir
                    ? "bg-[var(--noir-gold)] text-[#1a1a1a] hover:brightness-105"
                    : "bg-primary text-primary-foreground hover:opacity-90",
                )}
                aria-label="Account menu"
              >
                {(settings.accent ? "R" : "G")}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                Signed in locally
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => go("account")}>
                <UserIcon className="mr-2 h-4 w-4" /> Account
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("settings")}>
                <SettingsIcon className="mr-2 h-4 w-4" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => go("analytics")}>
                <HardDrive className="mr-2 h-4 w-4" /> Analytics
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openSearch}>
                <Search className="mr-2 h-4 w-4" /> Search
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => reset()}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
