// A person's photo, or their initial on a coloured circle when they have not set one.
// The colour is picked from the handle, so the same person always gets the same colour.
const COLORS = ["#6d28d9", "#db2777", "#0891b2", "#16a34a", "#ea580c", "#4f46e5", "#be123c", "#0d9488"];

export default function Avatar({
  handle,
  src,
  size = 40,
  className = "",
}: {
  handle: string;
  src: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" style={box} className={`shrink-0 rounded-full object-cover ${className}`} />;
  }
  let hash = 0;
  for (const ch of handle) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return (
    <div
      aria-hidden
      style={{ ...box, background: COLORS[hash % COLORS.length], fontSize: size * 0.42 }}
      className={`flex shrink-0 items-center justify-center rounded-full font-bold uppercase text-white ${className}`}
    >
      {handle.slice(0, 1)}
    </div>
  );
}
