"use client";

import dynamic from "next/dynamic";
import { BrandMark } from "@/components/brand";

/* The entire Lemniscate app is local-first: IndexedDB, localStorage,
   pdf.js workers, canvas — none of which exist on the server. We load
   it as a client-only chunk so SSR never touches the browser APIs. */
const App = dynamic(() => import("@/App"), {
  ssr: false,
  loading: () => (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-ink-950">
      <BrandMark size={64} animated className="text-gold-500" strokeWidth={2.5} />
      <p className="text-[11px] font-display uppercase tracking-[0.3em] text-mist-500 animate-pulse-soft">
        Opening the reading room…
      </p>
    </div>
  ),
});

export default function Home() {
  return <App />;
}
