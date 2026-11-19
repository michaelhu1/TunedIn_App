"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS: { href: string; label: string; also?: string[] }[] = [
  // Home is the friends feed, so adding friends, suggestions and other people's profiles
  // all belong to it.
  { href: "/home", label: "Home", also: ["/discover", "/friends", "/u", "/checkin", "/connect"] },
  { href: "/map", label: "Map" },
  { href: "/charts", label: "Charts" },
  { href: "/me", label: "Me" },
];

export default function TabBar({ pendingRequests = 0 }: { pendingRequests?: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 border-t border-foreground/10 bg-background/95 backdrop-blur">
      <ul className="mx-auto flex max-w-md">
        {TABS.map((t) => {
          const active = [t.href, ...(t.also ?? [])].some((h) => path === h || path.startsWith(h + "/"));
          const badge = t.href === "/home" && pendingRequests > 0;
          return (
            <li key={t.href} className="flex-1">
              <Link
                href={t.href}
                aria-current={active ? "page" : undefined}
                aria-label={badge ? `${t.label}, ${pendingRequests} friend request${pendingRequests === 1 ? "" : "s"} waiting` : undefined}
                className={`block py-4 text-center text-sm ${active ? "font-semibold" : "opacity-60"}`}
              >
                <span className="relative">
                  {t.label}
                  {badge && <span aria-hidden className="absolute -right-2.5 -top-1 h-2 w-2 rounded-full bg-danger" />}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
