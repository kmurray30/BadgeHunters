"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface NavUserMenuProps {
  userName: string;
  userImage?: string;
  isTestUser: boolean;
  role: string;
}

export function NavUserMenu({ userName, userImage, isTestUser, role }: NavUserMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleSignOut() {
    await fetch("/api/auth/signout", { method: "POST", redirect: "manual" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-card-hover transition-colors"
      >
        {userImage ? (
          <img src={userImage} alt="" className="h-6 w-6 rounded-full" />
        ) : (
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
        <span className="text-foreground">{userName}</span>
        {isTestUser && (
          <span className="rounded bg-warning/20 px-1.5 py-0.5 text-[10px] font-bold text-warning">
            TEST
          </span>
        )}
        {role === "superuser" && (
          <span className="rounded bg-accent/20 px-1.5 py-0.5 text-[10px] font-bold text-accent">
            SU
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-xl">
          <Link
            href="/profile"
            className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover"
            onClick={() => setIsOpen(false)}
          >
            Profile
          </Link>
          <Link
            href="/players"
            className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover"
            onClick={() => setIsOpen(false)}
          >
            Players
          </Link>
          {role === "superuser" && (
            <Link
              href="/admin"
              className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover"
              onClick={() => setIsOpen(false)}
            >
              Admin Tools
            </Link>
          )}
          <hr className="my-1 border-border" />
          <button
            onClick={handleSignOut}
            className="block w-full px-4 py-2 text-left text-sm text-danger hover:bg-card-hover"
          >
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
