"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface NavUserMenuProps {
  userName: string;
  userImage?: string;
  isTestUser: boolean;
  role: string;
  isAdminMode?: boolean;
}

const MENU_LINKS = [
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" },
  { href: "/sync", label: "Sync scores" },
  { href: "/feedback", label: "Feedback" },
];

export function NavUserMenu({ userName, userImage, isTestUser, role, isAdminMode = false }: NavUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!isOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Account menu"
        aria-expanded={isOpen}
        className="flex items-center rounded-full p-0.5 ring-1 ring-border transition hover:ring-accent"
      >
        {userImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={userImage} alt="" className="h-8 w-8 rounded-full" />
        ) : (
          <div className="font-display flex h-8 w-8 items-center justify-center rounded-full bg-accent/20 text-sm font-bold text-accent">
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="panel animate-fade-in absolute right-0 top-full mt-2 w-52 overflow-hidden py-1 shadow-2xl shadow-black/60">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <span className="font-display min-w-0 flex-1 truncate font-semibold">{userName}</span>
            {isTestUser && (
              <span className="rounded bg-warning/20 px-1 py-0.5 text-[9px] font-bold text-warning">TEST</span>
            )}
            {role === "superuser" && (
              <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-bold text-accent">SU</span>
            )}
          </div>
          {isAdminMode && (
            <Link
              href="/admin"
              className="block px-4 py-2.5 text-sm font-semibold text-warning hover:bg-card-hover"
              onClick={() => setIsOpen(false)}
            >
              Admin tools
            </Link>
          )}
          {MENU_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="block px-4 py-2.5 text-sm text-foreground hover:bg-card-hover"
              onClick={() => setIsOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <button
            onClick={handleSignOut}
            className="block w-full border-t border-border px-4 py-2.5 text-left text-sm text-danger hover:bg-card-hover"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
