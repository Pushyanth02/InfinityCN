import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Open_Sans } from "next/font/google";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  display: "swap",
});

const openSans = Open_Sans({
  variable: "--font-open-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://lemniscate.app"),
  title: "Lemniscate — Open the reading room",
  description:
    "A local-first AI reading room where documents become living, interactive experiences.",
  applicationName: "Lemniscate",
  keywords: [
    "Lemniscate",
    "reading room",
    "AI companion",
    "local-first",
    "PDF reader",
    "EPUB reader",
    "literary assistant",
    "OpenRouter",
    "IndexedDB",
  ],
  authors: [{ name: "Lemniscate" }],
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icon.svg", type: "image/svg+xml", sizes: "512x512" },
    ],
    shortcut: "/favicon.svg",
    apple: [
      { url: "/apple-touch-icon.svg", sizes: "180x180", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "Lemniscate — Open the reading room",
    description:
      "A local-first AI reading room where documents become living, interactive experiences.",
    url: "https://lemniscate.app",
    siteName: "Lemniscate",
    images: [
      {
        url: "/logo.svg",
        width: 460,
        height: 90,
        alt: "Lemniscate — Local-first AI reading room",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Lemniscate — Open the reading room",
    description:
      "A local-first AI reading room where documents become living, interactive experiences.",
    images: ["/logo.svg"],
  },
};

export const viewport: Viewport = {
  themeColor: "#08070a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600;1,7..72,400;1,7..72,500&family=EB+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Spectral:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap"
          rel="stylesheet"
        />
        <style>{`
          :root {
            --font-display: "Space Grotesk", "Open Sans", ui-sans-serif, system-ui, sans-serif;
            --font-body: "Open Sans", ui-sans-serif, system-ui, sans-serif;
          }
        `}</style>
      </head>
      <body
        className={`${spaceGrotesk.variable} ${openSans.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
