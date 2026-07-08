import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ThemeProvider } from "@/components/lemniscate/theme-provider";

export const metadata: Metadata = {
  title: "Lemniscate — Document-to-Storytelling",
  description:
    "Transform PDF, DOCX, and TXT files into structured cinematic narratives through deterministic, offline, classical-NLP processing. No LLMs. No AI APIs. Privacy-first.",
  keywords: [
    "Lemniscate",
    "document processing",
    "narrative reconstruction",
    "classical NLP",
    "deterministic",
    "offline",
    "cinematic storytelling",
    "privacy-first",
  ],
  authors: [{ name: "Lemniscate" }],
  applicationName: "Lemniscate",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    apple: [{ url: "/favicon.ico", type: "image/x-icon" }],
  },
  openGraph: {
    title: "Lemniscate — Document-to-Storytelling",
    description: "Deterministic document-to-storytelling. Offline. Privacy-first.",
    type: "website",
    siteName: "Lemniscate",
    images: [{ url: "/favicon.ico" }],
  },
  twitter: {
    card: "summary",
    title: "Lemniscate — Document-to-Storytelling",
    description: "Deterministic document-to-storytelling. Offline. Privacy-first.",
    images: ["/favicon.ico"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0a12",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="dark">
      <body className="antialiased bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
