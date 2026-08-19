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
  title: "Lemniscate — Open the reading room",
  description:
    "A local-first AI reading room where documents become living, interactive experiences.",
  keywords: [
    "Lemniscate",
    "reading room",
    "AI companion",
    "local-first",
    "PDF reader",
    "EPUB reader",
  ],
  authors: [{ name: "Lemniscate" }],
  icons: {
    icon: [
      {
        url: "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2308070a'/%3E%3Cpath d='M14 32c0-7 8-12 14-6l8 8c6 6 14 1 14-6s-8-12-14-6l-8 8c-6 6-14 1-14-6z' fill='none' stroke='%23d9ad52' stroke-width='3.5' stroke-linecap='round'/%3E%3C/svg%3E",
      },
    ],
  },
  openGraph: {
    title: "Lemniscate — Open the reading room",
    description:
      "A local-first AI reading room where documents become living, interactive experiences.",
    type: "website",
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
