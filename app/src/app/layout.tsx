import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif, Playfair_Display } from "next/font/google";
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

// Heading typefaces on trial (see src/lib/themes.ts). Each is only downloaded by the browser
// when a page actually uses it, so offering them does not slow down the default look.
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
const playfair = Playfair_Display({ variable: "--font-playfair", subsets: ["latin", "latin-ext"], display: "swap" });

// Runs before the page is drawn: applies the theme and typeface saved on this device, so
// the first paint already has the right colours. Kept tiny and free of dependencies.
const APPLY_SAVED_LOOK = `try{var d=document.documentElement,t=localStorage.getItem("tunedin:theme"),f=localStorage.getItem("tunedin:font");if(t)d.dataset.theme=t;if(f&&f!=="sans")d.dataset.font=f}catch(e){}`;

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
    // suppressHydrationWarning: the script below sets data-theme before React loads, which
    // React would otherwise report as a mismatch.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_LOOK }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} ${playfair.variable} antialiased`}
      >
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
