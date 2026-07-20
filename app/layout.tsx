import type { Metadata, Viewport } from "next";

import "../web/src/styles/base.css";
import "../web/src/styles/layout.css";
import "../web/src/styles/rebuild.css";
import "../web/src/styles/experience.css";
import "../web/src/styles/print.css";

export const metadata: Metadata = {
  title: "Letters & Light — make your deck easier to read",
  description:
    "Find a clear type direction, build a useful color palette from one image, and see both on real 16:9 slides. A presentation tool by pitch.dog.",
  applicationName: "Letters & Light",
  authors: [{ name: "pitch.dog", url: "https://pitch.dog" }],
  openGraph: {
    title: "Letters & Light — make your deck easier to read",
    description:
      "A clearer typographic voice, a working color world, or both—shown on real slides before you take the direction away.",
    type: "website",
    images: [{ url: "/assets/og-banner.png", width: 1200, height: 630, alt: "Letters & Light by pitch.dog" }],
  },
  icons: {
    icon: [{ url: "/assets/favicon-32.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/assets/icon-192.png", sizes: "192x192", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="stylesheet" href="/fonts/type-library/type-library.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
