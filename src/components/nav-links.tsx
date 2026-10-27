"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// The four tabs prefetch their full pages, so switching tabs doesn't wait on the network.
const NAV_ITEMS = [
  { href: "/", label: "Home", icon: HomeIcon, isActive: (path: string) => path === "/" },
  { href: "/badges", label: "Badges", icon: BadgeIcon, isActive: (path: string) => path.startsWith("/badges") },
  { href: "/levels", label: "Levels", icon: GridIcon, isActive: (path: string) => path.startsWith("/levels") },
  { href: "/players", label: "Players", icon: PlayersIcon, isActive: (path: string) => path.startsWith("/players") },
] as const;

/** Desktop links in the top bar. */
export function TopNavLinks() {
  const pathname = usePathname();
  return (
    <div className="hidden items-center gap-1 md:flex">
      {NAV_ITEMS.map((item) => {
        const active = item.isActive(pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch
            className={`font-display rounded-lg px-3 py-1.5 text-sm font-semibold uppercase tracking-wider transition-colors ${
              active ? "bg-accent/15 text-accent" : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/** Phone tab bar pinned to the bottom of the screen. */
export function BottomTabBar() {
  const pathname = usePathname();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/90 backdrop-blur-md md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto grid max-w-md grid-cols-4" style={{ height: "var(--tab-bar-height)" }}>
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] font-semibold transition-colors ${
                active ? "text-accent" : "text-muted active:text-foreground"
              }`}
            >
              {active && (
                <span className="absolute top-0 h-0.5 w-10 rounded-full bg-accent shadow-[0_0_12px_var(--accent)]" />
              )}
              <Icon className={`h-6 w-6 ${active ? "drop-shadow-[0_0_6px_var(--accent)]" : ""}`} />
              <span className="font-display uppercase tracking-wider">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

type IconProps = { className?: string };

function HomeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V20h14V9.5" />
      <path d="M10 20v-6h4v6" />
    </svg>
  );
}

function BadgeIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="6" />
      <path d="m9 14.5-1.5 6.5L12 19l4.5 2-1.5-6.5" />
      <path d="m12 6.5.9 1.8 2 .3-1.45 1.4.35 2-1.8-.95-1.8.95.35-2L9.1 8.6l2-.3z" />
    </svg>
  );
}

function GridIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function PlayersIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.6-3.6 3.3-5.5 6.5-5.5s5.9 1.9 6.5 5.5" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M17.5 14.5c2.2.3 3.7 1.8 4 4.5" />
    </svg>
  );
}
