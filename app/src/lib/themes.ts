// The colour themes and font groups people can pick in Settings. The colours themselves live in
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

/** A font group: one look for the whole app. `display` is the face for page titles and names,
 *  `text` is the face for everything else. The faces and their fine-tuning live in
 *  src/app/globals.css under the same id; the families are loaded in src/app/layout.tsx. */
export type FontGroup = { id: string; name: string; vibe: string; display: string; text: string };

export const DEFAULT_FONT = "clean";

export const FONT_GROUPS: FontGroup[] = [
  { id: "clean", name: "Clean", vibe: "Neutral and modern, the default", display: "Geist", text: "Geist" },
  { id: "zine", name: "Zine", vibe: "Indie magazine, liner notes", display: "Instrument Serif", text: "Instrument Sans" },
  { id: "literary", name: "Literary", vibe: "A book review; serif all the way through", display: "Instrument Serif", text: "Literata" },
  { id: "sleeve", name: "Sleeve", vibe: "Soft, heavy 70s record sleeve", display: "Fraunces", text: "Instrument Sans" },
  { id: "rotation", name: "Heavy Rotation", vibe: "Tour posters and merch drops", display: "Anton", text: "Archivo" },
  { id: "warehouse", name: "Warehouse", vibe: "Rave flyer, wide and loud", display: "Unbounded", text: "Geist" },
  { id: "bedroom", name: "Bedroom", vibe: "Bedroom pop, friendly and round", display: "Bricolage Grotesque", text: "Figtree" },
  { id: "terminal", name: "Terminal", vibe: "Synth readout, monospace titles", display: "Geist Mono", text: "Geist" },
  { id: "soft", name: "Soft", vibe: "Rounded and playful, sticker pack", display: "Fredoka", text: "Nunito" },
];

/** True when the page is currently showing a dark theme (chosen, or following the device). */
export function isDarkNow(): boolean {
  const chosen = document.documentElement.dataset.theme;
  if (chosen) return THEMES.find((t) => t.id === chosen)?.dark ?? false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
