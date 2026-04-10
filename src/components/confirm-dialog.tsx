"use client";

import { useEffect } from "react";

export interface ConfirmDialogAction {
  label: string;
  onClick: () => void;
  variant?: "danger" | "default" | "muted";
}

interface ConfirmDialogProps {
  title: string;
  description?: string;
  actions: ConfirmDialogAction[];
  onClose: () => void;
}

const VARIANT_CLASSES: Record<string, string> = {
  danger: "border-danger/30 bg-danger/10 text-danger hover:bg-danger/20",
  default: "border-border text-foreground hover:bg-card-hover",
  muted: "border-transparent text-muted hover:text-foreground",
};

export function ConfirmDialog({ title, description, actions, onClose }: ConfirmDialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="rounded-xl border border-border bg-card p-6 max-w-sm w-full shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted">{description}</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                VARIANT_CLASSES[action.variant ?? "default"]
              } ${action.variant === "muted" ? "text-center text-xs py-1" : ""}`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
