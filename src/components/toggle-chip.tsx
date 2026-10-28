"use client";

const TONES = {
  accent: "border-accent bg-accent/15 text-accent",
  highlight: "border-highlight bg-highlight/15 text-highlight",
  warning: "border-warning bg-warning/15 text-warning",
} as const;

interface ToggleChipProps {
  pressed: boolean;
  onToggle: () => void;
  tone?: keyof typeof TONES;
  children: React.ReactNode;
}

/** On/off button for a sort or filter; lit in its tone while on. */
export function ToggleChip({ pressed, onToggle, tone = "highlight", children }: ToggleChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onToggle}
      className={`shrink-0 rounded-xl border px-3 py-2 text-xs font-bold uppercase tracking-wide transition ${
        pressed ? TONES[tone] : "border-border text-muted hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}
