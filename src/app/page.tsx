"use client";

import { useEffect } from "react";
import { useNav } from "@/lib/nav-store";
import { useReaderSettings } from "@/hooks/use-reader-settings";
import { PageTransition } from "@/components/transition/page-transition";
import LandingPage from "@/components/landing/landing-page";
import DashboardView from "@/components/dashboard/dashboard-view";
import LibraryView from "@/components/library/library-view";
import { UploadView } from "@/components/upload/upload-view";
import ReaderView from "@/components/reader/reader-view";
import SettingsView from "@/components/settings/settings-view";
import AccountView from "@/components/account/account-view";
import AnalyticsView from "@/components/dashboard/analytics-view";
import HistoryView from "@/components/dashboard/history-view";
import SearchView from "@/components/dashboard/search-view";
import CreateView from "@/components/create/create-view";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";

export default function Home() {
  const view = useNav((s) => s.view);
  const { hydrated } = useReaderSettings();

  // Scroll to top on view change (except reader which manages its own scroll)
  useEffect(() => {
    if (typeof window !== "undefined" && view !== "reader") {
      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
    }
  }, [view]);

  // Sync body background with the current view's scope so overscroll and
  // any gap around the wrapper matches the intended palette:
  //  - landing: Aether Cinematic dark (obsidian #0D0E12)
  //  - dashboard/library/upload/settings/account/analytics/history/search: Noir & Gold (always dark)
  //  - reader: respects user theme (light/dark/sepia)
  useEffect(() => {
    if (typeof document === "undefined") return;
    const body = document.body;
    // Noir & Gold views always use a dark body background
    const noirViews = ["dashboard", "library", "upload", "settings", "account", "analytics", "history", "search", "create"];
    if (view === "landing") {
      body.style.backgroundColor = "#0D0E12";
    } else if (noirViews.includes(view)) {
      body.style.backgroundColor = "#070713";
    } else {
      // Reader: let the theme/scope handle the background
      body.style.backgroundColor = "";
    }
    body.dataset.view = view;
    return () => {
      body.style.backgroundColor = "";
    };
  }, [view]);

  // Prevent flash before reader settings hydrate
  if (!hydrated && view !== "landing") {
    return (
      <div className="grid min-h-dvh place-items-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  return (
    <>
      <PageTransition trigger={view} />
      <SectionErrorBoundary label="landing">
        {view === "landing" && <LandingPage />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="dashboard">
        {view === "dashboard" && <DashboardView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="library">
        {view === "library" && <LibraryView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="upload">
        {view === "upload" && <UploadView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="reader">
        {view === "reader" && <ReaderView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="settings">
        {view === "settings" && <SettingsView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="account">
        {view === "account" && <AccountView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="analytics">
        {view === "analytics" && <AnalyticsView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="history">
        {view === "history" && <HistoryView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="search">
        {view === "search" && <SearchView />}
      </SectionErrorBoundary>
      <SectionErrorBoundary label="create">
        {view === "create" && <CreateView />}
      </SectionErrorBoundary>
    </>
  );
}
