"use client";

import { useState, useRef, useEffect } from "react";

export interface SelectOption {
  value: string;
  label: string;
  tooltip?: string;
}

interface CustomSelectProps {
  options: SelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  /** Highlight the trigger with accent styling (e.g. when a filter is active) */
  highlighted?: boolean;
  /** Compact variant for use inside panels */
  compact?: boolean;
}

/**
 * Custom dropdown that replaces native <select> with a styled popover.
 * Closes on outside click and Escape. Opens upward if near the bottom of the viewport.
 */
export function CustomSelect({ options, value, onChange, placeholder = "Select...", className, highlighted, compact }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((option) => option.value === value);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleEscape);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  function handleOpen() {
    if (!isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setOpenUpward(spaceBelow < 200);
    }
    setIsOpen(!isOpen);
  }

  const triggerClasses = compact
    ? `inline-flex w-full items-center justify-between gap-1.5 rounded-md border px-2 py-1 text-xs transition-colors ${
        highlighted ? "border-accent/50 text-accent" : "border-border text-foreground hover:border-muted"
      }`
    : `inline-flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-xs transition-colors ${
        highlighted ? "border-accent/50 bg-card text-accent" : "border-border bg-card text-foreground hover:border-muted"
      }`;

  return (
    <div ref={containerRef} className={`relative ${className ?? ""}`}>
      <button ref={triggerRef} type="button" onClick={handleOpen} className={triggerClasses}>
        <span className={selectedOption ? "" : "text-muted"}>
          {selectedOption?.label ?? placeholder}
        </span>
        <svg className={`h-3 w-3 shrink-0 text-muted transition-transform ${isOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className={`absolute left-0 z-50 max-h-60 w-full min-w-[10rem] overflow-auto rounded-lg border border-border bg-card py-1 shadow-lg ${
          openUpward ? "bottom-full mb-1" : "top-full mt-1"
        }`}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => { onChange(option.value); setIsOpen(false); }}
              title={option.tooltip}
              className={`w-full px-3 py-1.5 text-left text-xs transition-colors ${
                option.value === value
                  ? "bg-accent/15 text-accent"
                  : "text-foreground hover:bg-card-hover"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
