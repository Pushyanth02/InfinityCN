"use client";

import { lazy, Suspense, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { useNav, usePrefs, useToasts } from "./lib/store";
import { migrateOwnership } from "./lib/data";
import { recoverStaleJobs, startJobReaper } from "./lib/jobs";
import { AppHeader } from "./components/header";
import {
  PageFade,
  ToastHost,
  ErrorBoundary,
  PageLoader,
} from "./components/ui";
import { AppAmbient } from "./components/brand";
import Landing from "./views/Landing";
import Dashboard from "./views/Dashboard";
import Upload from "./views/Upload";
import { cx } from "./lib/utils";

/* Heavy views are code-split so first paint stays fast; the brand loader
   covers the chunk fetch with intent instead of a blank gap. */
const Library = lazy(() => import("./views/Library"));
const Reader = lazy(() => import("./views/Reader"));
const Create = lazy(() => import("./views/Create"));
const Insights = lazy(() => import("./views/Insights"));
const Settings = lazy(() => import("./views/Settings"));

export default function App() {
  const view = useNav((s) => s.view);
  const docId = useNav((s) => s.docId);
  const motionOn = usePrefs((s) => s.prefs.reader.motion);
  const ring = usePrefs((s) => s.prefs.ring);
  const accent = usePrefs((s) => s.prefs.accent);

  /* first run: claim legacy un-owned rows for this local identity (no
     automatic seeding — a fresh visitor starts with an empty library);
     recover jobs interrupted by a reload; start the periodic reaper */
  useEffect(() => {
    void migrateOwnership();
    void recoverStaleJobs();
    startJobReaper();
  }, []);

  /* surface stray runtime errors as recoverable feedback instead of silence */
  useEffect(() => {
    const onError = (e: ErrorEvent) => {
      console.error("Uncaught error:", e.error ?? e.message);
      useToasts
        .getState()
        .push(
          "error",
          `Something went wrong: ${e.message || "unknown error"}. Your library is safe — try the action again.`,
        );
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const msg =
        e.reason instanceof Error
          ? e.reason.message
          : "a background task failed";
      console.error("Unhandled rejection:", e.reason);
      useToasts.getState().push("error", `Background task failed: ${msg}`);
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  /* reset scroll on view change */
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [view, docId]);

  const isLanding = view === "landing";
  // Analytics and History are one surface with two tabs — never remount
  // between them, or the tabs would flicker out mid-transition.
  const insightsView = view === "analytics" || view === "history";
  const pageKey = insightsView
    ? "insights"
    : view === "reader"
      ? `reader-${docId}`
      : view;

  return (
    <div
      className={cx("min-h-screen flex flex-col", !motionOn && "motion-off")}
      data-ring={ring}
      data-accent={accent}
    >
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-99 focus:px-4 focus:py-2 focus:bg-gold-500 focus:text-(--acc-ink) focus:rounded font-display text-sm"
      >
        Skip to content
      </a>
      {!isLanding && <AppAmbient />}
      {!isLanding && <AppHeader />}
      <main id="main" className="relative z-10 flex-1">
        <ErrorBoundary>
          <AnimatePresence mode="wait">
            <PageFade id={pageKey} key={pageKey}>
              <Suspense fallback={<PageLoader />}>
                {view === "landing" && <Landing />}
                {view === "dashboard" && <Dashboard />}
                {view === "library" && <Library />}
                {view === "upload" && <Upload />}
                {view === "reader" && <Reader key={docId ?? "none"} />}
                {view === "create" && <Create />}
                {insightsView && <Insights />}
                {(view === "settings" || view === "account") && <Settings />}
              </Suspense>
            </PageFade>
          </AnimatePresence>
        </ErrorBoundary>
      </main>
      <ToastHost />
    </div>
  );
}
