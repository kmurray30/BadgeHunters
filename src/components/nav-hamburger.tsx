"use client";

import Link from "next/link";
import { useState, useRef, useEffect } from "react";

export function NavHamburger() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative min-[28rem]:hidden" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-7 w-7 items-center justify-center rounded-md text-muted hover:text-foreground hover:bg-card-hover transition-colors"
        aria-label="More links"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full mt-1 w-36 rounded-lg border border-border bg-card py-1 shadow-xl">
          <Link
            href="/players"
            className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Players
          </Link>
          <Link
            href="/feedback"
            className="block px-4 py-2 text-sm text-foreground hover:bg-card-hover transition-colors"
            onClick={() => setIsOpen(false)}
          >
            Feedback
          </Link>
        </div>
      )}
    </div>
  );
}
