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

## Review Flow

The review process has two phases: entering review mode (client-side) and
completing the session (server-side).

1. **Enter Review Mode** (client-side only) — Any member clicks "Review." This
   is purely a UI state change (`isReviewing = true`). No server state changes.
   The session is still `active`. The member sees completion checkboxes and a
   "Complete Session" button. They can also "Cancel Review" to go back.

2. **Complete Session** (`completeMyReview`) — The member clicks "Complete Session"
   after checking off their badge completions. This:
   - If session is still `active`, transitions to `completed_pending_ack`.
   - Marks that user's ack as done.
   - Notifies other members who still need to review (skips already-done members).
   - When all members have completed, the session auto-closes.

---

## State Transitions

### 1. Session Creation → `active`

A session is created with status `active`. All members get an ack row with
`needsReview: true, acknowledgedAt: null`.

### 2. Enter Review Mode (client-side only)

**Trigger:** Any member clicks "Review".

**What happens:**
- No server changes. Client-side `isReviewing` state toggles on.
- UI shows review prompt, completion checkboxes, and "Complete Session" button.
- Member can click "Cancel Review" to go back to active mode.

### 3. Complete Session (per-user)

**Trigger:** A member clicks "Complete Session".

**What happens:**
- If session is still `active`, transitions to `completed_pending_ack`
  (`Session.completedAt` and `Session.completedByUserId` set).
- That user's ack is updated (`needsReview: false, acknowledgedAt: now()`).
- That user's review notification is deleted.
- Other members who still need review and don't already have a notification get one.
- Silently no-ops if session is already `closed` or doesn't exist (stale tab).

### 4. All Members Completed → `completed_pending_ack` to `closed`

**Trigger:** The last member completes their review (automatic check after step 3).

**What happens:**
- After updating the ack, the system checks if any `needsReview: true` remain.
- If none remain → session status becomes `closed`.
- Any remaining review notifications are cleaned up.

### 5. Dismiss Review (client-side only)

**Trigger:** A member clicks "Cancel Review" while in server-pushed review mode
(i.e., someone else completed and the session is `completed_pending_ack`).

**Restriction:** Only available when user has **NOT** completed their own review
and the date has NOT passed.

**What happens:**
- No server changes. Client-side `dismissedReview` state toggles on.
- The review UI is hidden — the session appears in its pre-review state.
- The "Review" button reappears so the user can re-enter review mode later.
- Navigating away and returning will show the review mode again (dismiss is
  not persisted).

### 6. Re-open (full reset)

**Trigger:** A member clicks "Re-open" on a session in `completed_pending_ack`
or `closed` state.

**Restriction:** Only allowed when the session date has **NOT** passed
(`Date.now() <= expiresAt`). Past-date sessions show "Edit" instead.

**What happens:**
- ALL members' acks are reset to `needsReview: true, acknowledgedAt: null`.
- Session transitions to `active`, `completedAt`/`completedByUserId` cleared.
- All `session_review` notifications for this session are cleaned up.
- Silently no-ops if session is already `active` or doesn't exist (stale tab).

**Why reset all acks?** If only the caller's ack were reset and the session
went to `active`, other members with `needsReview: false` would land in a
dead zone — no "Review" button (they're done) and no "Re-open" button
(session isn't in a completed/closed state). Resetting everyone avoids this.

### 7. Auto-dismiss Review Notification

**Trigger:** Automatic — when a user views a session page that's in review mode
(`inReviewMode` is true on the client).

**What happens:**
- The client calls `dismissSessionReviewNotification(sessionId)`.
- Deletes only the viewer's `session_review` notification for that session.
- Other users' notifications are untouched.
- Prevents the redundant scenario where a user is already reviewing and still
  sees a bell notification telling them to review.

### 8. Edit Mode (client-side only, anyone)

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
    completions and complete your session."
  - The "Complete Session" button is available.
  - The "Undo My Review" button is **NOT** available (date has passed).
  - Once anyone completes, the `active` → `completed_pending_ack` transition
    fires and notifications go out to others who still need review.
- **For non-members:** The UI shows "Closed" — they don't see review workflow details.

### Future Sessions

A session is "future" when `sessionDateLA > today` and status is `active`.
- The "Review" button is hidden.
- Members can select badges but cannot start the review.

### Cancel Restrictions

| Condition                 | Can re-open? |
|---------------------------|--------------|
| Date NOT passed           | Yes          |
| Date passed               | No (Edit)    |

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
| Review (click button)         | Client-side only              | None                                                    |
| Cancel Review                 | Client-side only (dismiss)    | None                                                    |
| Complete Session              | Ack → done, notification rm   | Session → `completed_pending_ack` (if active), others who still need review are notified (unless last → session closes) |
| Re-open                       | ALL acks → reset               | Always → `active`. All completion metadata cleared, all review notifications deleted. |
| Leave Session                 | Removed from session          | Ack deleted, notifications deleted for that user        |
| Added to Session              | Ack created (`needsReview`)   | `session_added` notification sent to added user         |

---

## Notification Types

| Type             | Created when                                       | Deleted when                                                          |
|------------------|----------------------------------------------------|-----------------------------------------------------------------------|
| `session_added`  | User is added to a session (not self-join)         | User is removed from session                                          |
| `session_review` | Someone completes their session (sent to others who still need review) | User completes own review, user views session in review mode (auto-dismiss), someone re-opens session, session closes |

---

## Non-Member vs Member Status Display

Non-members see a simplified view. The internal review workflow (pending review,
ack states) is irrelevant to them — they just need to know if the session is
still happening or done.

| Viewer     | Status shown                                                              |
|------------|---------------------------------------------------------------------------|
| Non-member | "Active" (if not `closed` and not past-date) or "Closed" (otherwise)     |
| Member     | Full granularity: Active, Future, Reviewing, Closed                       |

Non-members can still enter **Edit mode** on past-date sessions to help correct
badge completions.

---

## Visual State Mapping (UI)

### Session Detail Page — Members

| Global Status             | User's `needsReview` | Date Passed? | Buttons Available                          |
|---------------------------|----------------------|--------------|--------------------------------------------|
| `active`                  | `true`               | No           | "Review" (client-side toggle)              |
| `active`                  | `true`               | Yes          | "Complete Session" (implicit review)       |
| `active` (future)         | `true`               | No           | None (badge selection only)                |
| `completed_pending_ack`   | `true`               | No           | "Complete Session", "Cancel Review"        |
| `completed_pending_ack`   | `true`               | Yes          | "Complete Session" (no cancel)             |
| `completed_pending_ack`   | `false`              | No           | "Re-open"                                  |
| `completed_pending_ack`   | `false`              | Yes          | "Edit"                                     |
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
