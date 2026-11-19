import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import SiteAnalytics from "@/components/site-analytics";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TunedIn",
  description: "See what your friends nearby are listening to right now.",
  appleWebApp: { capable: true, title: "TunedIn", statusBarStyle: "default" },
};

// Phone-first: fill the screen, and tint the browser bar to match the app.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
