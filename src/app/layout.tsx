import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { initializeApp } from "@/infrastructure/initialization";
import { Analytics } from "@vercel/analytics";

// Initialize app infrastructure on startup (skip during build — no DynamoDB available)
if (process.env.NEXT_PHASE !== "phase-production-build") {
  initializeApp().catch((error) => {
    console.error("Failed to initialize app:", error);
    process.exit(1);
  });
}

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  ),
  title: {
    default: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
    template: `%s | ${process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio"}`,
  },
  description:
    process.env.NEXT_PUBLIC_SITE_DESCRIPTION || "A photography portfolio",
  openGraph: {
    type: "website",
    siteName: process.env.NEXT_PUBLIC_SITE_NAME || "Portfolio",
  },
  twitter: {
    card: "summary",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1e1e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cloudfrontDomain = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN;

  return (
    <html lang="en">
      <head>
        {cloudfrontDomain && (
          <>
            <link rel="preconnect" href={`https://${cloudfrontDomain}`} />
            <link rel="dns-prefetch" href={`https://${cloudfrontDomain}`} />
          </>
        )}
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
