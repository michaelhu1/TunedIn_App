"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; also?: string[] }[] = [
  { href: "/home", label: "Home" },
  { href: "/map", label: "Map" },
  { href: "/charts", label: "Charts" },
  // One tab for both "Discover" (/discover) and "Your friends" (/friends).
  { href: "/discover", label: "People", also: ["/friends", "/u"] },
  { href: "/me", label: "Me" },
];

export default function TabBar() {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-foreground/10 bg-background/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = [t.href, ...(t.also ?? [])].some((h) => path === h || path.startsWith(h + "/"));
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                className={`block py-4 text-center text-sm ${active ? "font-semibold" : "opacity-60"}`}
              >
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
