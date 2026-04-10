"use client";

import { useEffect } from "react";

export interface NotificationPopupAction {
  label: string;
  onClick: () => void;
  variant?: "primary" | "default" | "muted";
}

interface NotificationPopupProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actions: NotificationPopupAction[];
  onClose: () => void;
}

const VARIANT_CLASSES: Record<string, string> = {
  primary: "bg-accent text-white hover:bg-accent/90",
  default: "border border-border text-foreground hover:bg-card-hover",
  muted: "text-muted hover:text-foreground text-xs",
};

export function NotificationPopup({ icon, title, description, actions, onClose }: NotificationPopupProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <div
        className="rounded-xl border border-border bg-card p-6 max-w-sm w-full shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        {icon && (
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-accent/10 text-accent">
            {icon}
          </div>
        )}
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-xs text-muted">{description}</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {actions.map((action, index) => (
            <button
              key={index}
              onClick={action.onClick}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors text-center ${
                VARIANT_CLASSES[action.variant ?? "default"]
              }`}
            >
              {action.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
