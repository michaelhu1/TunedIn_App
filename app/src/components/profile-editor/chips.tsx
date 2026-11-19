"use client";

// Tappable tags for picking from a fixed list (genres, music roles, "open to").
//
// Each chip is a real <button aria-pressed>, so it works with Tab and Space/Enter and a
// screen reader says "Indie, toggle button, pressed". Colours come from foreground and
// background, so the selected chip is the inverse of the page in both light and dark mode.

export function Chip({
  pressed,
  disabled,
  onToggle,
  children,
}: {
  pressed: boolean;
  disabled?: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={`rounded-full border px-3 py-1.5 text-sm transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground disabled:cursor-not-allowed disabled:opacity-40 ${
        pressed
          ? "border-accent bg-accent text-accent-foreground"
          : "border-foreground/20 hover:bg-foreground/5"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * A labelled set of chips for one list. `options` maps the stored key to the label shown.
 * When `max` is reached, the unselected chips are disabled (selected ones can still be
 * turned off) and `limitHint` explains why.
 */
export function ChipGroup<K extends string>({
  id,
  label,
  options,
  selected,
  onToggle,
  max,
  limitHint,
  disabled,
  help,
}: {
  id: string;
  label: string;
  options: readonly (readonly [K, string])[];
  selected: readonly K[];
  onToggle: (key: K) => void;
  max?: number;
  limitHint?: string;
  disabled?: boolean;
  help?: React.ReactNode;
}) {
  const full = max !== undefined && selected.length >= max;
  const describedBy = [help ? `${id}-help` : null, full && limitHint ? `${id}-limit` : null].filter(Boolean).join(" ");
  return (
    // role="group" + aria-labelledby gives the chips a shared name, like a <fieldset>.
    <div role="group" aria-labelledby={`${id}-label`} aria-describedby={describedBy || undefined} className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-sm opacity-80">
        {label}
        {max !== undefined && (
          <span className="opacity-60">
            {" "}
            ({selected.length}/{max})
          </span>
        )}
      </span>
      {help && (
        <p id={`${id}-help`} className="text-xs opacity-60">
          {help}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.map(([key, text]) => {
          const pressed = selected.includes(key);
          return (
            <Chip key={key} pressed={pressed} disabled={disabled || (full && !pressed)} onToggle={() => onToggle(key)}>
              {text}
            </Chip>
          );
        })}
      </div>
      {/* Always rendered (empty until the limit is hit) so screen readers announce the
          hint when it appears; a live region added at that moment is often missed. */}
      {limitHint && (
        <p id={`${id}-limit`} aria-live="polite" className="text-xs opacity-60">
          {full ? limitHint : ""}
        </p>
      )}
    </div>
  );
}
