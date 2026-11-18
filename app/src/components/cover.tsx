// Album art with a plain square fallback. A normal <img> on purpose: the art comes from
// music CDNs that already serve the right size, so Next's image optimizer adds nothing.
export default function Cover({ src, size, className = "" }: { src: string | null; size: number; className?: string }) {
  const box = { width: size, height: size };
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" style={box} className={`shrink-0 rounded object-cover ${className}`} />
  ) : (
    <div style={box} className={`shrink-0 rounded bg-foreground/10 ${className}`} />
  );
}
