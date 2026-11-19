"use client";

import { useEffect, useState } from "react";
import { FONT_KEY, FONTS, THEME_KEY, THEMES } from "@/lib/themes";

// Appearance: colour theme and heading typeface. Both are remembered on this device only
// (nothing is sent to the server) and applied by setting an attribute on <html>, which the
// stylesheet reacts to. A tiny script in the page head applies the saved choice before the
// first paint, so there is no flash of the wrong colours on load.
export default function AppearanceSettings() {
  // null = "Match my phone": no saved choice, follow the device's light or dark setting.
  const [theme, setTheme] = useState<string | null>(null);
  const [font, setFont] = useState<string>("sans");

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme ?? null);
    setFont(document.documentElement.dataset.font ?? "sans");
  }, []);

  function chooseTheme(id: string | null) {
    setTheme(id);
    try {
      if (id) window.localStorage.setItem(THEME_KEY, id);
      else window.localStorage.removeItem(THEME_KEY);
    } catch {}
    if (id) document.documentElement.dataset.theme = id;
    else delete document.documentElement.dataset.theme;
  }

  function chooseFont(id: string) {
    setFont(id);
    try {
      window.localStorage.setItem(FONT_KEY, id);
    } catch {}
    if (id === "sans") delete document.documentElement.dataset.font;
    else document.documentElement.dataset.font = id;
  }

  return (
    <div className="flex flex-col gap-5">
      <fieldset>
        <legend className="mb-2 text-sm font-medium">Colours</legend>
        <div className="grid grid-cols-3 gap-2">
          <Swatch name="Match my phone" selected={theme === null} onClick={() => chooseTheme(null)} colors={["#FFFFFF", "#0E0E11", "#8A63D2"]} split />
          {THEMES.map((t) => (
            <Swatch key={t.id} name={t.name} selected={theme === t.id} onClick={() => chooseTheme(t.id)} colors={t.swatch} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Headings</legend>
        <div className="flex flex-col gap-2">
          {FONTS.map((f) => (
            <label key={f.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-foreground/15 px-3 py-2 has-checked:border-accent">
              <input type="radio" name="heading-font" checked={font === f.id} onChange={() => chooseFont(f.id)} className="accent-current" />
              <span className="text-sm">
                <span className="font-medium">{f.name}</span>
                <span className="opacity-60"> · {f.note}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}

function Swatch({
  name,
  selected,
  onClick,
  colors,
  split = false,
}: {
  name: string;
  selected: boolean;
  onClick: () => void;
  colors: [string, string, string] | string[];
  split?: boolean;
}) {
  const [bg, fg, accent] = colors;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`flex flex-col gap-1.5 rounded-xl border p-1.5 text-left ${selected ? "border-accent ring-2 ring-accent" : "border-foreground/15"}`}
    >
      {/* A miniature of the theme: its background, a line of "text", and its accent. */}
      <span
        aria-hidden
        className="flex h-12 w-full items-end justify-between rounded-lg border border-black/10 p-2"
        style={{ background: split ? `linear-gradient(135deg, ${bg} 50%, ${fg} 50%)` : bg }}
      >
        <span className="h-1.5 w-8 rounded-full" style={{ background: split ? accent : fg }} />
        <span className="h-4 w-4 rounded-full" style={{ background: accent }} />
      </span>
      <span className="truncate px-0.5 text-xs font-medium">{name}</span>
    </button>
  );
}
