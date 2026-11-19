// The colour themes people can pick under Me. The colours themselves live in
// src/app/globals.css; this is the list the picker shows, with a few swatch colours each so
// a theme can be previewed before choosing it.

export const THEME_KEY = "tunedin:theme";
export const FONT_KEY = "tunedin:font";

export type Theme = { id: string; name: string; dark: boolean; swatch: [background: string, foreground: string, accent: string] };

export const THEMES: Theme[] = [
  { id: "light", name: "Light", dark: false, swatch: ["#FFFFFF", "#141317", "#57068C"] },
  { id: "dark", name: "Dark", dark: true, swatch: ["#0E0E11", "#F2F1F5", "#B9A2FF"] },
  { id: "paper", name: "Paper", dark: false, swatch: ["#F2EBDC", "#17120B", "#27329F"] },
  { id: "prussian", name: "Prussian Night", dark: true, swatch: ["#0F1E33", "#F1E6CF", "#E8C547"] },
  { id: "cobalt", name: "Cobalt", dark: true, swatch: ["#1D3488", "#F6F0DE", "#F4D23C"] },
  { id: "mars", name: "Mars Violet", dark: true, swatch: ["#1A1420", "#E6DCCB", "#E59AA5"] },
  { id: "hermosa", name: "Hermosa", dark: false, swatch: ["#FBEDEE", "#15111F", "#1F5FA8"] },
  { id: "grenadine", name: "Grenadine", dark: true, swatch: ["#161012", "#F6EEE6", "#FF5A3C"] },
];

/** Heading typefaces on trial. "sans" is the current look (Geist everywhere). */
export const FONTS = [
  { id: "sans", name: "Clean", note: "Geist everywhere, as now" },
  { id: "instrument", name: "Editorial", note: "Instrument Serif headings" },
  { id: "playfair", name: "Classic", note: "Playfair Display headings" },
] as const;

/** True when the page is currently showing a dark theme (chosen, or following the device). */
export function isDarkNow(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return THEMES.find((t) => t.id === chosen)?.dark ?? false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
