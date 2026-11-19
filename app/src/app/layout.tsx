import type { Metadata, Viewport } from "next";
import {
  Anton,
  Archivo,
  Bricolage_Grotesque,
  Figtree,
  Fraunces,
  Fredoka,
  Geist,
  Geist_Mono,
  Instrument_Sans,
  Instrument_Serif,
  Literata,
  Nunito,
  Unbounded,
} from "next/font/google";
import SiteAnalytics from "@/components/site-analytics";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"], preload: false });

// Typefaces for the font groups in Settings (see src/lib/themes.ts and globals.css). With
// preload off, the browser downloads a typeface only when something on screen uses it, so
// offering nine looks costs nothing for someone who keeps the default. (The options must be
// written out in full on each line: the font loader reads them at build time.)
const instrumentSerif = Instrument_Serif({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-instrument", weight: "400", style: ["normal", "italic"] });
const instrumentSans = Instrument_Sans({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-instrument-sans" });
const literata = Literata({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-literata" });
const fraunces = Fraunces({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fraunces", axes: ["SOFT"] });
const anton = Anton({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-anton", weight: "400" });
const archivo = Archivo({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-archivo" });
const unbounded = Unbounded({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-unbounded" });
const bricolage = Bricolage_Grotesque({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-bricolage", axes: ["opsz"] });
const figtree = Figtree({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-figtree" });
const fredoka = Fredoka({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-fredoka" });
const nunito = Nunito({ subsets: ["latin"], display: "swap", preload: false, variable: "--font-nunito" });

const FONT_VARIABLES = [
  geistSans, geistMono, instrumentSerif, instrumentSans, literata, fraunces, anton, archivo, unbounded, bricolage, figtree, fredoka, nunito,
]
  .map((f) => f.variable)
  .join(" ");

// Runs before the page is drawn: applies the theme and font group saved on this device, so
// the first paint already has the right look. Kept tiny and free of dependencies. The two
// renames keep a choice made during the earlier headings-only trial.
const APPLY_SAVED_LOOK = `try{var d=document.documentElement,t=localStorage.getItem("tunedin:theme"),f=localStorage.getItem("tunedin:font");if(t)d.dataset.theme=t;if(f==="instrument")f="zine";if(f==="playfair")f="literary";if(f&&f!=="sans"&&f!=="clean")d.dataset.font=f}catch(e){}`;

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
    <html lang="en" className={FONT_VARIABLES} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APPLY_SAVED_LOOK }} />
      </head>
      <body className="antialiased">
        {children}
        <SiteAnalytics />
      </body>
    </html>
  );
}
