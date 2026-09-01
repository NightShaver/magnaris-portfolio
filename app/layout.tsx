import type { Metadata, Viewport } from "next";

import "./globals.css";
import { fontVariables } from "./fonts";
import { SmoothScroll } from "@/components/ui/SmoothScroll";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { Preloader } from "@/components/ui/Preloader";

const SITE_URL = "https://magnaris.studio";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Magnaris — Web / 3D / Software",
    template: "%s — Magnaris",
  },
  description:
    "Ein Technology & Design Studio für Web, interaktive 3D-Erlebnisse, SaaS-Produkte und die Systeme dahinter.",
  keywords: [
    "WebGL Studio",
    "React Three Fiber",
    "3D Web",
    "SaaS Entwicklung",
    "Webdesign",
    "Technical Art",
  ],
  openGraph: {
    type: "website",
    locale: "de_DE",
    url: SITE_URL,
    siteName: "Magnaris",
    title: "Magnaris — Richtung wird Wirkung.",
    description:
      "Technische Präzision mit menschlicher Klarheit. Web, Realtime-3D, SaaS und die Systeme dahinter.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Magnaris — Richtung wird Wirkung.",
    description:
      "Technology & Design Studio für Web, interaktive 3D-Erlebnisse und SaaS-Produkte.",
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#111723",
  colorScheme: "dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de" className={fontVariables} suppressHydrationWarning>
      <body className="bg-ink text-frost antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-6 focus:top-6 focus:z-[100] focus:rounded-full focus:bg-teal focus:px-5 focus:py-2 focus:text-ink"
        >
          Zum Inhalt springen
        </a>

        <Preloader />

        <SmoothScroll>
          <SiteHeader />
          <main id="main">{children}</main>
        </SmoothScroll>

        {/* Film grain sits above everything, ignores pointer events. */}
        <div aria-hidden className="grain" />
      </body>
    </html>
  );
}
