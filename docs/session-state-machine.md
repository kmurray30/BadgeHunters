# Session State Machine

## Overview

A session tracks a group of badge hunters meeting to complete badges together.
Every session has a **global status** and each member has a **per-user review
state** stored in `SessionUserAcknowledgement`.

---

## Global Session Status (`Session.status`)

| Status                  | Meaning                                                         |
|-------------------------|-----------------------------------------------------------------|
| `active`                | Session is live. Members can select/complete badges.            |
| `completed_pending_ack` | Someone started the review. Members confirm their completions.  |
| `closed`                | All members completed their review. Session is archived.        |

## Per-User Review State (`SessionUserAcknowledgement`)

| `needsReview` | `acknowledgedAt` | Meaning                                          |
|---------------|-------------------|--------------------------------------------------|
| `true`        | `null`            | User has not completed their review yet.          |
| `false`       | `<timestamp>`     | User has completed their review.                  |

---

## Two-Step Review Flow

The review process is intentionally split into two steps:

1. **Start Review** (`startReview`) — Any member clicks "Review For Completion."
   This transitions the session from `active` → `completed_pending_ack` and
   notifies other members. The triggering user is NOT automatically marked as
   done — they still need to confirm.

2. **Complete My Review** (`completeMyReview`) — Each member clicks "Complete My
   Review" after checking off their badge completions. This marks that user's
   ack as done. When all members have completed, the session auto-closes.

---

## State Transitions

### 1. Session Creation → `active`

A session is created with status `active`. All members get an ack row with
`needsReview: true, acknowledgedAt: null`.

### 2. Start Review → `active` to `completed_pending_ack`

**Trigger:** Any member clicks "Review For Completion".

**What happens:**
- Session status transitions from `active` → `completed_pending_ack`.
- `Session.completedAt` and `Session.completedByUserId` are set.
- All *other* members receive a `session_review` notification.
- The triggering user's ack is NOT changed — they still need to complete step 2.

### 3. Complete My Review (per-user)

**Trigger:** A member clicks "Complete My Review" while in `completed_pending_ack`.

**What happens:**
- That user's ack is updated (`needsReview: false, acknowledgedAt: now()`).
- That user's review notification is deleted.
- No new notifications are created for others.

### 4. All Members Completed → `completed_pending_ack` to `closed`

**Trigger:** The last member completes their review (automatic check after step 3).

**What happens:**
- After updating the ack, the system checks if any `needsReview: true` remain.
- If none remain → session status becomes `closed`.
- Any remaining review notifications are cleaned up.

### 5. User Cancels Their Own Review (Undo)

**Trigger:** A member clicks "Undo My Review".

**Restriction:** Only allowed when the session date has **NOT** passed
(`Date.now() <= expiresAt`). Once the date passes, reviews cannot be undone.

**What happens:**
- Only that user's ack is reset to `needsReview: true, acknowledgedAt: null`.
- That user's review notification is deleted.
- Other users are NOT affected — their ack state and notifications are untouched.
- **Edge case:** If ALL users have now cancelled (all `needsReview: true`), the
  session reverts from `completed_pending_ack` → `active`, and
  `completedAt`/`completedByUserId` are cleared. All remaining review
  notifications are cleaned up.

### 6. Reopen (admin/superuser escape hatch)

**Trigger:** The "Re-open" button (only available for members on current-day
sessions that are `completed_pending_ack` or `closed`).

**What happens:**
- Session status → `active`.
- `completedAt` and `completedByUserId` are cleared.
- ALL member acks are reset to `needsReview: true, acknowledgedAt: null`.
- All `session_review` notifications are deleted.

### 7. Edit Mode (client-side only, anyone)

**Trigger:** The "Edit" button on past-date sessions. Available to anyone
(members and non-members).

**What happens:**
- Client-side only — no server state changes.
- Shows badge selection tab and completion checkboxes.
- Exiting edit mode returns to the closed/read-only view.
- Any badge completion changes during edit ARE persisted server-side.

---

## Date Logic

The session's `expiresAt` is set to **6:00 AM the day after the session date**
(local time). This is the cutoff for "past date."

### Past-Date Active Sessions (implicit review mode)

When a session is still `active` but the date has passed (`Date.now() > expiresAt`):
- **For members:** The UI treats it as **effectively in review**, even though the
  global status is still `active`.
  - Members see the review prompt: "The session date has passed. Review your badge
    completions and complete your review."
  - The "Complete My Review" button is available.
  - The "Undo My Review" button is **NOT** available (date has passed).
  - Once anyone completes, the normal `active` → `completed_pending_ack` transition
    fires and notifications go out to others.
- **For non-members:** The UI shows "Closed" — they don't see review workflow details.

### Future Sessions

A session is "future" when `sessionDateLA > today` and status is `active`.
- The "Review For Completion" button is hidden.
- Members can select badges but cannot start the review.

### Cancel Restrictions

| Condition                 | Can cancel own review? |
|---------------------------|------------------------|
| Date NOT passed           | Yes                    |
| Date passed               | No                     |

---

## Badge Selection During Review vs Edit

| Phase              | Badge selection tab visible? | Rationale                                    |
|--------------------|------------------------------|----------------------------------------------|
| Active             | Yes                          | Planning phase — pick your badges            |
| Review (pending)   | No                           | Confirmation phase — just check completions  |
| Edit (client-side) | Yes                          | Correction mode — add forgotten badges       |
| Future             | Yes                          | Pre-planning allowed                         |

---

## Inter-User Activity Summary

| Action                        | Effect on the acting user     | Effect on other users                                   |
|-------------------------------|-------------------------------|---------------------------------------------------------|
| Review For Completion         | None (ack unchanged)          | Session → `completed_pending_ack`, notifications sent   |
| Complete My Review            | Ack → done, notification rm   | None (unless last → session closes)                     |
| Undo My Review                | Ack → reset                   | None (unless all cancel → session reverts to `active`)  |
| Reopen Session                | All acks reset                | All acks reset, all review notifications removed        |
| Leave Session                 | Removed from session          | Ack deleted, notifications deleted for that user        |
| Added to Session              | Ack created (`needsReview`)   | `session_added` notification sent to added user         |

---

## Notification Types

| Type             | Created when                                       | Deleted when                                                          |
|------------------|----------------------------------------------------|-----------------------------------------------------------------------|
| `session_added`  | User is added to a session (not self-join)         | User is removed from session                                          |
| `session_review` | Someone starts review (sent to other members)      | User completes own review, session reverts to `active`, session closes |

---

## Non-Member vs Member Status Display

Non-members see a simplified view. The internal review workflow (pending review,
ack states) is irrelevant to them — they just need to know if the session is
still happening or done.

| Viewer     | Status shown                                                              |
|------------|---------------------------------------------------------------------------|
| Non-member | "Active" (if not `closed` and not past-date) or "Closed" (otherwise)     |
| Member     | Full granularity: Active, Future, Review Pending, Closed                  |

Non-members can still enter **Edit mode** on past-date sessions to help correct
badge completions.

---

## Visual State Mapping (UI)

### Session Detail Page — Members

| Global Status             | User's `needsReview` | Date Passed? | Buttons Available                          |
|---------------------------|----------------------|--------------|--------------------------------------------|
| `active`                  | `true`               | No           | "Review For Completion"                    |
| `active`                  | `true`               | Yes          | "Complete My Review" (implicit review)     |
| `active` (future)         | `true`               | No           | None (badge selection only)                |
| `completed_pending_ack`   | `true`               | —            | "Complete My Review"                       |
| `completed_pending_ack`   | `false`              | No           | "Undo My Review"                           |
| `completed_pending_ack`   | `false`              | Yes          | Locked — no undo, "Edit" available         |
| `closed`                  | —                    | No           | "Re-open"                                  |
| `closed`                  | —                    | Yes          | "Edit"                                     |

### Session Detail Page — Non-Members

| Global Status             | Date Passed? | Status Badge | Buttons Available |
|---------------------------|--------------|--------------|-------------------|
| `active`                  | No           | Active       | None              |
| `active`                  | Yes          | Closed       | Edit              |
| `completed_pending_ack`   | —            | Active       | None              |
| `closed`                  | —            | Closed       | Edit (past-date)  |

### Sessions List Page

| Condition                                          | Badge (member)   | Badge (non-member) | Section         |
|----------------------------------------------------|------------------|--------------------|-----------------|
| `active` + current/future date                     | Active/Future    | Active             | Active Sessions |
| `active` + past date + user `needsReview`          | Pending Review   | Active             | Active Sessions |
| `completed_pending_ack` + user `needsReview`       | Pending Review   | Active             | Active Sessions |
| `completed_pending_ack` + user done                | Closed           | —                  | Session History |
| `completed_pending_ack` + non-member               | —                | Active             | Active Sessions |
| `closed`                                           | Closed           | Closed             | Session History |

### Landing Page (members only)

| Condition                                           | Group              |
|-----------------------------------------------------|--------------------|
| `active` + current date + not effectively in review | Active Sessions    |
| Effectively in review + user `needsReview`          | Pending Review     |
| `active` + future date                              | Future Sessions    |
| User already completed review (any status)          | Not shown          |
| `closed`                                            | Not shown          |
