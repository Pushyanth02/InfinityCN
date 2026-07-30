import type { Metadata } from "next";
import { Open_Sans, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

// ── Typography ────────────────────────────────────────────────────────────
// App-wide fonts: Space Grotesk for display headings (geometric, technical),
// Open Sans for body/UI text (high x-height, open counters, screen-optimized).
// These are the fixed app fonts for landing, dashboard, library, settings, etc.

const openSans = Open_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

// Reader-only font families (Georgia, Verdana, Bookerly, Garamond) are
// system/web-safe stacks exposed as CSS variables. They are NOT applied
// globally — only inside .reader-article when the user selects them in
// the reader settings sheet. See globals.css for the scoping.

export const metadata: Metadata = {
  title: "Lemniscate — Turn any document into an interactive story",
  description:
    "Upload anything. Lemniscate weaves it into an AI-guided narrative you can explore, share, and remember.",
  keywords: ["Lemniscate", "reading", "AI", "documents", "PDF", "EPUB", "library"],
  authors: [{ name: "Lemniscate" }],
  openGraph: {
    title: "Lemniscate — Interactive AI storytelling",
    description:
      "Upload anything. Lemniscate weaves it into an AI-guided narrative you can explore, share, and remember.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lemniscate — Interactive AI storytelling",
    description:
      "Upload anything. Lemniscate weaves it into an AI-guided narrative you can explore, share, and remember.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Web-safe font stacks for the reader-selectable families.
            These are only applied inside .reader-article, never globally. */}
        <style>{`
          :root {
            --font-georgia: Georgia, "Times New Roman", serif;
            --font-verdana: Verdana, Geneva, "DejaVu Sans", sans-serif;
            --font-garamond: "Garamond", "EB Garamond", Georgia, serif;
            --font-bookerly: "Bookerly", Georgia, "Cambria", serif;
            --font-literata: "Literata", Georgia, ui-serif, serif;
            --font-open-sans: "Open Sans", ui-sans-serif, system-ui, sans-serif;
          }
        `}</style>
      </head>
      <body
        className={`${openSans.variable} ${spaceGrotesk.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
