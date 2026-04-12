"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NotificationPopup } from "./notification-popup";

export interface NotificationItem {
  id: string;
  type: "session_added" | "session_review";
  sessionId: string | null;
  sessionDate: string | null; // ISO date string
  readAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
}

interface NotificationCenterProps {
  notifications: NotificationItem[];
}

function formatRelativeTime(isoString: string): string {
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function formatSessionDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("en-US", {
    timeZone: "UTC",
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function notificationText(notification: NotificationItem): string {
  const dateStr = notification.sessionDate ? formatSessionDate(notification.sessionDate) : "a session";
  if (notification.type === "session_added") return `You were added to a session on ${dateStr}`;
  if (notification.type === "session_review") return `Session on ${dateStr} needs your review`;
  return "New notification";
}

export function NotificationCenter({ notifications }: NotificationCenterProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [localNotifications, setLocalNotifications] = useState(notifications);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync with fresh server props after router.refresh() re-renders the layout
  useEffect(() => {
    setLocalNotifications(notifications);
    setDismissed(new Set());
  }, [notifications]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Popups: notifications that haven't been dismissed yet (in current state)
  const pendingPopups = localNotifications.filter(
    (notification) => !notification.dismissedAt && !dismissed.has(notification.id)
  );
  const currentPopup = pendingPopups[0] ?? null;

  const unreadCount = localNotifications.filter((notification) => !notification.readAt).length;

  async function dismissNotification(id: string) {
    setDismissed((prev) => new Set([...prev, id]));
    await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "dismiss", id }),
    });
  }

  async function handleBellClick() {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening && unreadCount > 0) {
      // Mark all as read
      setLocalNotifications((prev) =>
        prev.map((notification) => ({ ...notification, readAt: notification.readAt ?? new Date().toISOString() }))
      );
      await fetch("/api/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark-read" }),
      });
      router.refresh();
    }
  }

  async function handlePopupView(notification: NotificationItem) {
    await dismissNotification(notification.id);
    if (notification.sessionId) {
      router.push(`/sessions/${notification.sessionId}`);
    }
  }

  return (
    <>
      {/* Popup overlay — shows first undismissed notification */}
      {currentPopup && (
        <NotificationPopup
          icon={
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          }
          title={
            currentPopup.type === "session_added"
              ? `You've been added to a session`
              : `Session needs your review`
          }
          description={
            currentPopup.sessionDate
              ? currentPopup.type === "session_added"
                ? `You were added to the session on ${formatSessionDate(currentPopup.sessionDate)}.`
                : `The session on ${formatSessionDate(currentPopup.sessionDate)} is ready for review.`
              : undefined
          }
          actions={[
            {
              label: currentPopup.type === "session_added" ? "View Session" : "Review Now",
              onClick: () => handlePopupView(currentPopup),
              variant: "primary",
            },
            {
              label: "Close",
              onClick: () => dismissNotification(currentPopup.id),
              variant: "muted",
            },
          ]}
          onClose={() => dismissNotification(currentPopup.id)}
        />
      )}

      {/* Bell icon + dropdown */}
      <div className="relative" ref={dropdownRef}>
        <div className="relative inline-flex h-8 w-8">
          <button
            onClick={handleBellClick}
            className="flex h-full w-full items-center justify-center rounded-lg text-muted hover:text-foreground hover:bg-card-hover transition-colors"
            title="Notifications"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </button>
          {unreadCount > 0 && (
            <span
              className="pointer-events-none flex items-center justify-center"
              style={{
                position: "absolute", top: -6, right: -6,
                height: 18, minWidth: 18, paddingInline: 4,
                borderRadius: 9999, backgroundColor: "#dc2626",
                fontSize: 10, fontWeight: 700, color: "#fff",
                lineHeight: 1,
              }}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </div>

        {isOpen && (
          <div
            className="absolute right-0 top-full mt-1 rounded-xl border border-border bg-card shadow-xl overflow-hidden"
            style={{ width: 320, maxWidth: "calc(100vw - 1rem)" }}
          >
            <div className="border-b border-border px-4 py-2.5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Notifications</p>
            </div>

            {localNotifications.length === 0 ? (
              <div className="px-4 py-6 text-center">
                <p className="text-xs text-muted">No notifications yet</p>
              </div>
            ) : (
              <div className="max-h-80 overflow-y-auto divide-y divide-border">
                {localNotifications.map((notification) => {
                  const isUnread = !notification.readAt;
                  const text = notificationText(notification);
                  const href = notification.sessionId ? `/sessions/${notification.sessionId}` : null;
                  const content = (
                    <div className={`px-4 py-3 transition-colors hover:bg-card-hover ${isUnread ? "bg-selection/30" : ""}`}>
                      <div className="flex items-start gap-2">
                        {isUnread && (
                          <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                        )}
                        <div className={isUnread ? "" : "ml-3.5"}>
                          <p className="text-xs text-foreground leading-snug">{text}</p>
                          <p className="mt-0.5 text-[10px] text-muted">{formatRelativeTime(notification.createdAt)}</p>
                        </div>
                      </div>
                    </div>
                  );

                  return href ? (
                    <Link key={notification.id} href={href} onClick={() => setIsOpen(false)}>
                      {content}
                    </Link>
                  ) : (
                    <div key={notification.id}>{content}</div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
