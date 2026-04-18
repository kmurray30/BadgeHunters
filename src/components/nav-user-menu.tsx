"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface NavUserMenuProps {
  userId: string;
  userName: string;
  userImage?: string;
  isTestUser: boolean;
  role: string;
  isAdminMode?: boolean;
}

export function NavUserMenu({ userId, userName, userImage, isTestUser, role, isAdminMode = false }: NavUserMenuProps) {
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
        className="flex items-center gap-1 rounded-full p-1 hover:bg-card-hover transition-colors"
      >
        {userImage ? (
          <img src={userImage} alt="" className="h-7 w-7 rounded-full" />
        ) : (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-medium text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-card py-1 shadow-xl">
          {isAdminMode && (
            <>
              <Link
                href="/admin"
                className="block px-4 py-2 text-sm font-semibold text-warning hover:bg-card-hover transition-colors"
                onClick={() => setIsOpen(false)}
              >
                Admin Tools
              </Link>
              <hr className="my-1 border-border" />
            </>
          )}
          <Link
            href="/profile"
            className="flex items-center gap-2 px-4 py-2 text-sm text-foreground hover:bg-card-hover"
            onClick={() => setIsOpen(false)}
          >
            <span className="flex-1">Profile</span>
            {isTestUser && (
              <span className="rounded bg-warning/20 px-1 py-0.5 text-[9px] font-bold text-warning">TEST</span>
            )}
            {role === "superuser" && (
              <span className="rounded bg-accent/20 px-1 py-0.5 text-[9px] font-bold text-accent">SU</span>
            )}
          </Link>
          <Link
            href="/settings"
            className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover"
            onClick={() => setIsOpen(false)}
          >
            Settings
          </Link>
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
