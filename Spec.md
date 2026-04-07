# Activate Badge Planner — Product & Technical Spec (v1)

## 1. Overview

This is a small private web app for a single friend group to plan which Activate badges to go for during a visit, track who has completed which badges, and coordinate around shared in-person sessions.

The app is **not** intended for scale. It is a lightweight internal tool for roughly 6–10 people. Simplicity, clarity, and maintainability matter more than extensibility or enterprise-grade architecture.

Core goals:

1. Let users log in with Google and link themselves to an Activate player profile.
2. Maintain a database of badges, games, rooms, users, badge completion state, and sessions.
3. Show a powerful badge browser with useful filters.
4. Let users create shared sessions with real users and ghost players.
5. Generate **user-specific badge suggestions** based on the current party.
6. Let users mark their own badge completion and difficulty opinions.
7. Preserve a session history.
8. Support superuser maintenance tools and an admin mode for test/dev workflows.
9. Include a lightweight feedback feature visible only to superusers.

This spec is for **v1** only.

---

## 2. Product scope

## In scope for v1

* Google OAuth login for normal users (including superusers)
* **Admin mode** — a password-gated mode (not an account) that enables text-only test account creation/login, bypassing OAuth
* Activate username/account linking during signup
* Score scraping from `https://playactivate.com/scores`
* Daily retryable score sync, isolated so app functionality does not depend on it
* Manual score editing by superusers
* Badge database seeded from uploaded badge tracker
* Badge browsing with filters
* Badge detail page
* Per-user badge completion state
* Per-user difficulty ratings
* Badge comments with reactions and pinning
* Shared sessions for a single day
* Ghost players in sessions
* User-specific session recommendations
* Shared group session plan
* Session history
* Post-session completion prompts
* Feedback submission page plus superuser feedback dashboard
* Admin mode with isolated test users and dev/test cheats (fake users, time override, score override, etc.)

## Explicitly out of scope for v1

* Public social feed
* Multiple friend groups / organizations / clubs
* Additional OAuth/social providers beyond Google (no Apple/GitHub/etc.)
* Notifications beyond simple in-app prompts/banners
* Any attempt to support scale beyond a tiny friend group
* Location-specific badge systems
* Ghost players with any functionality beyond headcount/name placeholders
* Real moderation systems
* Fancy analytics
* Mobile-native app

---

## 3. High-level stack

## Recommended stack

* **Frontend:** React with Next.js App Router
* **Backend:** Next.js server actions and/or route handlers
* **Language:** TypeScript
* **Database:** PostgreSQL
* **ORM:** Prisma
* **Auth:** Auth.js / NextAuth with Google provider; admin mode uses a separate password gate (not an account)
* **Hosting:** Vercel
* **Database hosting:** Supabase Postgres
* **Cron/background work:** Vercel Cron for daily score sync
* **Scraping:** isolated server-side scraping module using Playwright or another browser automation tool if necessary

This stack is acceptable and not overkill for this project. It is slightly more infrastructure than strictly necessary, but still a clean, boring choice.

---

## 4. Roles, permissions, and admin mode

There are two roles — **user** and **superuser** — plus a separate **admin mode** that is not a role or an account.

## user

Can:

* log in
* manage own profile
* edit own badge completion state
* edit own badge difficulty rating
* add/edit own badge comments
* react to badge comments
* create sessions
* join/view sessions they are part of
* mark their own badge completions from sessions
* submit feedback

Cannot:

* edit other users' badge status
* edit other users' scores
* access feedback dashboard

## superuser

Can do everything a normal user can, plus:

* edit any user's badge status
* edit any user's score
* manage other users' roles (promote/demote superusers)
* access feedback dashboard
* view all submitted feedback
* edit badge catalog fields (rooms, games, etc.)
* control score sync behavior manually
* inspect scrape failures

Seed:

* `kyle.murray100` (Google OAuth) should be seeded or first-login elevated to **superuser**

## admin mode

Admin mode is **not** a role and **not** an account. It is a **mode** the app can enter, gated by an environment-provided password. Its purpose is to enable test/dev workflows without fighting OAuth.

When admin mode is active:

* you can **create** accounts using text-only input (Activate player name only) — no OAuth required
* you can **log in** to any of these test accounts using text-only input
* all test accounts are automatically **superusers**
* test accounts and real accounts are **fully isolated**: real users never see test users or their data, and test users never see real users or their data

Admin mode also unlocks dev/test cheats:

* override time/date for session expiry testing
* override scores for testing
* manipulate session states
* trigger score sync manually
* create sample sessions quickly
* inspect scrape failures

Admin mode can be used in both local development and production.

---

## 5. Authentication and signup

## Login methods

Two flows exist, plus admin mode:

1. **Google OAuth** for real users (`auth_type = google`). Used for normal users and for **superuser** accounts (e.g. `kyle.murray100`).
2. **Test user login / create** for test users (`auth_type = test`), available only when **admin mode** is active (see below).

## Admin mode activation (bare minimum security)

This app is a small private tool, not a high-assurance system. Required baseline:

* Admin mode password provided via **environment variable**; compare using a **password hash** (e.g. bcrypt), not plaintext in the DB or repo.
* **HTTPS** in production (e.g. Vercel default).
* Entering the correct password puts the app into admin mode for that browser session. It does **not** create or log in as a user account.

**Rate limiting** and similar controls are **optional**; implement only if low cost. Do not over-build.

### users.auth_type

* `auth_type` (`google` | `test`)

There is no admin user row. Admin mode is a session-level flag, not a user identity.

## Google login flow

1. User clicks "Sign in with Google".
2. After Google auth succeeds, the app asks for:

   * real name
   * Activate player name (or attempts account lookup first using Google email)
3. The app checks `https://playactivate.com/scores` using the Google email first.
4. If an account is found, show:

   * "Are you `<playername>`?"
5. If user confirms, link that Activate player.
6. If not found, or user says no:

   * ask user to enter their Activate player name
   * validate it against the Activate score page
7. If valid, create/link the account.
8. Immediately attempt initial score scrape after linking.

Important:

* The score lookup is an **enrichment step**, not a hard dependency for the app to function.
* If validation is flaky or scrape fails temporarily, do not corrupt data.
* If signup validation fails in a weird way, it is acceptable to let a superuser fix the account later.

## Test user flow (admin mode only)

When admin mode is active:

* You can create a **test user** by entering a **display name** (any text — it does not need to match a real Activate account and is not validated against the score page).
* You can log in as any existing test user by selecting or entering their name.
* All test accounts are created with `role = superuser` and `auth_type = test`.
* Test accounts are flagged as `is_test_user = true`.
* The display name is stored as `activate_player_name` for consistency, but it is purely cosmetic for test users.

Rules:

* Test login is separate from OAuth
* Test users must be clearly marked in DB and UI
* Test users can exist in prod and local
* Test users should not participate in real score sync unless explicitly enabled
* Test users should be visually labeled as test accounts

## Data isolation

Test accounts and real accounts live in **completely separate worlds**:

* When logged in as a real user (Google OAuth), you only see other real users, their sessions, their badge data, their comments, etc. Test users are invisible.
* When logged in as a test user (via admin mode), you only see other test users, their sessions, their badge data, their comments, etc. Real users are invisible.
* This isolation applies to all user-facing queries: sessions, session members, badge completion tags, feedback, comments, profile lists, etc.
* The badge catalog itself is shared (badges are not user-specific), but all per-user data on top of badges (completion, difficulty ratings, comments) is isolated.

This keeps test data from polluting the real experience and vice versa.

---

## 6. Activate score integration

## Goals

* Link each real user to an Activate profile
* Periodically sync scores
* Derive rank color from score if needed
* Avoid bad updates from broken scraping

## Score sync rules

The score sync system must be isolated and retryable.

It must not block:

* login
* badge browsing
* session use
* any core app functionality

## Daily sync behavior

Once per day:

* attempt to scrape each eligible real user's Activate score
* validate returned data
* only update the score if the result looks sane

If scrape fails or returns weird/untrusted data:

* store sync failure log
* keep last known good score
* do not overwrite with bad data

## "Weird number" validation

Define a validator with checks such as:

* result exists
* player name matches expected linked account closely enough
* score is numeric
* score is not negative
* score is not implausibly lower than previous score unless explicitly allowed
* result shape matches expected page pattern

If validation fails:

* no score update

## Manual score editing

Superusers can manually edit user scores.

This is for maintenance/fixing, not to disable sync.

Preferred model:

* store current displayed score directly
* also store whether last update source was `scrape`, `manual`, or `test_override`
* future scrapes may continue to update unless a protected override mode is later added

Minimum fields to track:

* current_score
* rank_color
* last_score_source
* last_synced_at
* last_good_score_at

Optionally store raw snapshots/history for debugging.

## Rank color mapping

Rank color is derived from a player's cumulative score. Each 100k band corresponds to one color.

**Mapping (verify against actual Activate system — these are best-guess values):**

| Score range | Rank color |
|---|---|
| 0 – 99,999 | White |
| 100,000 – 199,999 | Blue |
| 200,000 – 299,999 | Green |
| 300,000 – 399,999 | Orange |
| 400,000 – 499,999 | Red |
| 500,000+ | Purple |

Implementation notes:

* Store this mapping as app-level config, not in the database. A simple lookup function is enough.
* `rank_color` on the `users` table is derived from `current_score` using this mapping. Update it whenever `current_score` changes.
* The "CHASING RAINBOWS" badge (badge #18) requires 5 players with 5 distinct rank colors, which means the party needs players spanning at least 5 of these bands.
* If the real Activate system has more or fewer colors, adjust the table. The important thing is that the mapping exists as a concrete, configurable definition.

---

## 7. Core data model

Use real relational tables for core entities. Avoid one giant JSON blob.

Enums are acceptable for **room** and **game** in v1.

Because badges may apply to multiple rooms/games, the cleanest simple approach is:

* badge row
* badge has arrays of room enums and game enums

If Prisma/Postgres enum-array friction becomes annoying, use string arrays constrained in app code.

## Main tables

### users

Represents all users: OAuth users and test users.

Fields:

* id
* email (nullable for test users)
* auth_type (`google` | `test`)
* role (`user` | `superuser`)
* real_name
* display_name_mode (`player_name` | `real_name`)
* activate_player_name
* google_account_name / provider info as needed
* current_score
* rank_color
* is_test_user
* is_active
* created_at
* updated_at
* last_login_at
* last_synced_at
* last_score_source

Notes:

* session player / profile player / badge status player always tie back to this table
* display mode controls whether UI shows player name or real name for that user
* `is_test_user` is the key flag for data isolation — all queries that return user-visible data must filter by this flag to enforce separation between test and real worlds

### badges

Seeded from uploaded badge tracker.

Fields:

* id
* badge_number
* name
* description
* default_completed_import_flag (optional; import-only if needed, not canonical)
* rooms[]  (enum array or string array)
* games[]  (enum array or string array)
* player_count_bucket (`none` | `lte_3` | `gte_5`)
* tags[]   (string array is fine)
* default_difficulty (`unknown` | `easy` | `medium` | `hard` | `impossible`)
* duration_label (nullable string or enum later)
* is_per_visit (boolean)
* is_meta_badge (boolean)
* active (boolean)
* created_at
* updated_at

Notes:

* canonical completion is **not** stored here
* `default_difficulty = unknown` corresponds to UI `???`
* if `rooms` or `games` are missing or empty after import, **superusers** may fill them in later via maintenance tooling (normal users do not edit badge catalog fields)

### badge_user_status

One row per user per badge.

Fields:

* id
* user_id
* badge_id
* is_completed
* completed_at (nullable)
* personal_difficulty (`unknown` | `easy` | `medium` | `hard` | `impossible` | null)
* ideal_player_count_bucket (`none` | `lte_3` | `gte_5` | null)
* personal_notes_summary (nullable; optional)
* created_at
* updated_at

Rules:

* users can edit only their own row
* superusers can edit anyone's row
* one unique row per `(user_id, badge_id)`

### badge_comments

Single running public thread per badge.

Fields:

* id
* badge_id
* author_user_id
* body
* is_pinned
* edited_at (nullable)
* deleted_at (soft delete optional)
* created_at
* updated_at

Rules:

* users can edit only their own comments
* superusers may edit/delete/moderate if needed
* pinned comments always render at top

### badge_comment_reactions

Fields:

* id
* comment_id
* user_id
* reaction_type
* created_at

Rules:

* unique `(comment_id, user_id, reaction_type)`

### badge_meta_rules

For dynamic badge eligibility rules.

Fields:

* id
* badge_id
* rule_type
* rule_payload_json
* active
* created_at
* updated_at

Examples:

* last day of month
* time-of-day window
* all 5 players different rank colors

These badges still live in `badges`; rules live here.

### sessions

Represents a single day's outing / planning session.

Fields:

* id
* created_by_user_id
* title (optional auto-generated)
* status (`active` | `completed_pending_ack` | `closed`)
* session_date_local
* expires_at
* completed_at (nullable)
* completed_by_user_id (nullable)
* created_at
* updated_at

Rules:

* expires by default at **6am PST/PDT** the following day
* this is a shared entity

### session_members

Real users participating in a session.

Fields:

* id
* session_id
* user_id
* added_by_user_id
* joined_at
* created_at

Rules:

* unique `(session_id, user_id)`

### session_ghost_members

Ghost players are pure headcount/name placeholders.

Fields:

* id
* session_id
* display_name
* created_at

No other functionality.

### session_badge_selections

Tracks badges selected for a session by individual users.

Fields:

* id
* session_id
* badge_id
* selected_by_user_id
* created_at
* updated_at

Rules:

* unique `(session_id, badge_id, selected_by_user_id)`
* multiple users can independently select the same badge
* group page aggregates these selections

### session_user_acknowledgements

Tracks whether each real session participant has acknowledged/completed post-session review.

Fields:

* id
* session_id
* user_id
* acknowledged_at (nullable)
* dismissed_at (nullable)
* needs_review (boolean)
* created_at
* updated_at

Purpose:

* after session completion, each user can separately come back and review which badges they personally earned

### feedback_posts

Simple lightweight site feedback/messages.

Fields:

* id
* author_user_id
* body
* status (`open` | `addressed` | `archived`) optional
* edited_at (nullable)
* created_at
* updated_at

### feedback_reactions

Fields:

* id
* feedback_post_id
* user_id
* reaction_type
* created_at

Visibility:

* any logged-in user may submit feedback
* only superusers may view feedback dashboard

---

## 8. Enums and controlled values

## difficulty enum

Internal values:

* `unknown`
* `easy`
* `medium`
* `hard`
* `impossible`

UI mapping:

* `unknown` => `???`

Display rules:

1. If user has given a personal rating, show that
2. Else if at least one user vote exists, show average difficulty including default difficulty as one vote, unless default is `unknown`
3. Else show default difficulty
4. If default is `unknown` and there are no user votes, display `???`
5. `???`/`unknown` is always sorted last

For averaging:

* `easy = 1`
* `medium = 2`
* `hard = 3`
* `impossible = 4`
* `unknown` ignored in averaging

### player_count_bucket enum

* `none`
* `lte_3`
* `gte_5`

Interpretation:

* `lte_3`: especially suitable when session headcount is 3 or fewer
* `gte_5`: especially suitable when session headcount is 5 or more
* `none`: no special recommendation behavior

### role enum

* `user`
* `superuser`

### auth_type enum

* `google`
* `test`

### reaction_type enum

Predefined set of emoji reactions. Keep it small — this is a tiny friend group app, not Slack.

* `thumbs_up`
* `heart`
* `laugh`
* `fire`
* `question`

Used by both `badge_comment_reactions` and `feedback_reactions`. Free-form emoji is explicitly **not** supported in v1 to keep the UI simple. If the group wants more options later, add them to the enum.

### display_name_mode enum

* `player_name`
* `real_name`

Default for new users: `player_name`.

---

## 9. Pages and UX

## 9.1 Login page

Features:

* **Sign in with Google** — real users and superusers (OAuth).
* **Enter Admin Mode** — password-only; activates admin mode for the current browser session. Does **not** log in as a user. Once active, shows a test-user creation/login interface.
* Clear separation between OAuth login and admin mode.

Admin mode (when active):

* Shows a test-user panel: create a new test account by entering a name, or select an existing test user to log in as.
* All test accounts created here are superusers.
* The admin mode indicator should be visible in the UI while active.

## 9.2 Onboarding / account linking page

Shown after first Google login if account is not fully linked.

Flow:

* collect real name
* try Activate lookup by Google email
* if found, ask "Are you `<playername>`?"
* if user says no or not found, ask for Activate player name
* validate against Activate scores page
* create user
* immediately attempt initial score fetch

## 9.3 Badge list page

Main badge browser.

Features:

* filter badges
* mark own completion
* view completion state
* open badge details
* optionally edit badge fields via dropdown for allowed roles
* show relevant user/session tags

Filters:

* completed vs not completed (relative to current user)
* by room
* by game
* by tags
* by player count bucket
* by difficulty
* by per-visit vs normal
* by players who have not completed
* by players who have completed
* by "only badges I haven't completed"
* by "only badges selected session users haven't completed" if session context exists
* search by name/description

Role-based edit behavior:

* normal users can edit their own badge status/difficulty
* superusers can edit any user's badge status and scores
* badge row dropdown may expose superuser tools if needed

## 9.4 Badge detail page

Shows:

* badge name, number, description
* rooms
* games
* tags
* default difficulty
* community average difficulty
* your difficulty
* ideal player count bucket if available
* who has completed it
* notes/comments
* per-user difficulty breakdown
* your completion state
* your badge controls

Comments section:

* one running thread per badge
* pinned comments first, sorted by reaction count desc
* then regular comments
* users can edit own comments
* reactions allowed
* multiple pinned comments allowed

## 9.5 User profile page

Shows:

* real name / player name depending on display settings
* current score
* rank color
* badge progress summary
* completed badges
* recent activity
* score sync info (optional)
* superuser edit controls if authorized

Also useful:

* display toggle preference: player name vs real name

## 9.6 Session creation page

Used to create a shared visit.

Flow:

1. choose real users in party
2. add any number of ghost players with names
3. create session for today
4. immediately go to session page

Session header should show:

* all real users in party
* all ghost players in party
* headcount total

### Session visibility and membership rules

* Any user can **see** all sessions (past and present) — sessions are not private. This is a small friend group; hiding sessions adds complexity for no benefit.
* Any session member can **add** other users to the session after creation (not just the creator).
* Users **cannot** add themselves to a session they are not already in — another member must add them.
* Users **can** leave a session they are in (remove themselves). If the creator leaves, the session continues normally.
* There is **no limit** on the number of active sessions per day. If two people create separate sessions for the same day, both exist independently. Users can be members of multiple sessions.
* The UI should make it obvious if a user is in multiple active sessions (e.g. show a list), but this is not an error condition — it just means the group split up.

## 9.7 Session page

This is one of the main features.

The session page has two subpages/tabs:

### A. Your badges

This page is **specific to the currently viewing user**.

It shows recommended badges for that user based on:

* badges the user has not completed
* how many other session participants also have not completed them
* current party size and ghost count
* player count bucket
* per-visit status
* difficulty sorting

This page should look different for each user.

The viewer can select badges they want to go for in this session.

### B. Group badges

This page is shared.

It shows badges selected by session members, split into:

* badges selected by **you**
* badges selected by **others** (excluding ones also selected by you, so no duplicates)

Layout:

* per-visit section at top

  * yours
  * others
* normal badges section next

  * yours
  * others

Each badge card should show:

* which session participants selected it
* which session participants have completed it
* only session participants are shown here
* ghost players are not shown as completion tags
* all user tags here should only reflect real users in this session

## 9.8 Session history page

Shows past sessions with:

* date/time
* participants
* ghost players
* who completed the session
* selected badges
* badges the current user later marked complete from that session
* session status

Users can revisit old sessions and mark their own badge completions at any future time.

## 9.9 Feedback page / dashboard

User-facing behavior:

* any logged-in user can submit feedback posts

Visibility:

* only superusers can view feedback posts

Features:

* lightweight posts/messages
* edit own feedback
* reactions
* optional status fields like open/addressed/archived

This replaces the broader social page.

## 9.10 Admin mode tools

Available only when admin mode is active.

Features:

* create test user (text-only — enter a name, get a superuser test account)
* log in as existing test user
* time override
* score override
* trigger/resume score sync
* create sample sessions quickly
* inspect scrape failures
* edge-case helpers for sessions and badges

Must be clearly marked as admin/test tooling. Should show an obvious indicator that admin mode is active.

---

## 10. Badge display and difficulty rules

## Displayed difficulty precedence

For the currently logged-in user, a badge's displayed difficulty should be:

1. **Your difficulty**, if you have rated it
2. Else **community average**, if at least one user vote exists

   * include the default difficulty as one vote if the default difficulty is not `unknown`
3. Else **default difficulty**
4. If default is `unknown` and there are no user votes, display `???`

## Averaging and rounding

When computing community average difficulty:

* Map each non-unknown vote to its numeric value: `easy = 1`, `medium = 2`, `hard = 3`, `impossible = 4`.
* Include the badge's `default_difficulty` as one additional vote if it is not `unknown`.
* Compute the arithmetic mean.
* Round to the **nearest integer** (standard rounding: 0.5 rounds up). Map back to the label: 1 = easy, 2 = medium, 3 = hard, 4 = impossible.
* Example: 3 users vote `easy` (1) and the default is `hard` (3). Mean = (1+1+1+3)/4 = 1.5, rounds to 2 = `medium`.

## Sorting difficulty

When sorting ascending:

* easy
* medium
* hard
* impossible
* unknown (`???`) last

---

## 11. Session recommendation logic

This logic must be implemented explicitly.

## Definitions

For a given session and current viewer:

* **viewer** = logged-in user viewing the session
* **real session users** = users in `session_members`
* **ghost count** = number of `session_ghost_members`
* **display party size** = real session users + ghost count
* **room-cap-relevant size** = min(5, display party size)

Ghost players:

* count for party size and player-count preference logic
* do not count for completion history
* do not appear in completion tags

## "Your badges" base filter

Show only badges that:

* the viewer has **not** completed

Optional toggles may further widen or narrow the set.

## Uncompleted-group prioritization rules

If total display party size is **5 or fewer**:

* strongly prioritize badges where **everyone else in the party** also has not completed the badge

If total display party size is **greater than 5**:

* strongly prioritize badges where **at least 4 other real users** also have not completed the badge
* this reflects that only 5 people can play a room at once

Also show broader relevant badges where:

* at least the viewer and one other real session user have not completed it

The UI should support toggles to relax the recommendation set, such as:

* best shared candidates
* broader shared candidates
* all badges you haven't done

## Player count bucket boost rules

If badge bucket is `gte_5`:

* boost when session display party size >= 5
* if party size < 5, deprioritize or optionally hide by default

If badge bucket is `lte_3`:

* boost when display party size <= 3
* if party size >= 5, still allow it but do not boost

If bucket is `none`:

* neutral

## Per-visit behavior

Per-visit badges should be separated visually and rendered in their own section above normal badges.

Recommended layout inside "Your badges":

* per-visit recommended badges
* normal recommended badges

## Suggested ranking order for "Your badges"

Within each section, sort roughly by:

1. badges matching strongest shared-uncompleted condition
2. number of other real session users who have not completed it, descending
3. player-count bucket boost
4. difficulty ascending, with `unknown` last
5. optional duration tie-breaker later

This does not need to be mathematically perfect. It should be deterministic and understandable.

---

## 12. Session selection behavior

Users select badges from their own "Your badges" page.

Those selections appear in the shared "Group badges" page.

Rules:

* users can select or unselect badges independently
* same badge can be selected by multiple users
* group page aggregates selectors
* no duplication between "yours" and "others" sections for the same viewer
* viewer sees their selected badges in "yours"
* badges only selected by other users appear in "others"

This is selection-driven, not recommendation-driven.

---

## 13. Session completion lifecycle

## Status model

Session statuses:

* `active`
* `completed_pending_ack`
* `closed`

## Completion flow

1. Session starts as `active`
2. Any session participant can press **Complete Session**
3. Session becomes `completed_pending_ack`
4. The user who completed it is prompted to review their own badge completions
5. Other session users, on next visit to the session, see:

   * "`<player>` has completed the session. Complete session and update badges?"
6. They can:

   * review now
   * dismiss and do later

Important:

* session completion does **not** auto-award any badges
* badge completion is always per-user

## Automatic expiry / closure

At **6am PST/PDT** after the session date:

* the active session should automatically stop being treated as current-day active
* pending users should still have a visible prompt to review their session outcomes
* the session may transition to `closed` once all users are done, or by scheduled auto-close logic

Do **not** silently mark badges complete.

Users must be able to revisit old sessions later and mark badges complete for themselves.

---

## 14. Badge completion flows

Users can mark their own badge completions in three places:

1. directly on badge list page
2. on badge detail page
3. from a session review flow

When marking completed, prompt for optional metadata:

* difficulty
* ideal player count bucket (`lte_3` or `gte_5` or none)
* optional note

Users can edit these fields later at any time.

Superusers can edit anyone's status.

---

## 15. Meta badges

Meta badges are stored as normal rows in `badges` with `is_meta_badge = true`. Their dynamic eligibility is determined by `badge_meta_rules`.

The session page should evaluate meta rules against the current session context and surface any currently eligible meta badges.

### Supported rule types for v1

Only the following `rule_type` values need to be implemented in v1. Each has a defined `rule_payload_json` shape.

**`day_of_month`** — eligible on specific days of the month.

```json
{ "days": [28, 29, 30, 31], "match": "last_day_only" }
```

* `match: "last_day_only"` means: eligible only on the actual last day of the current month (handles Feb, 30-day months, etc.).
* `match: "any"` means: eligible if today is any of the listed days.

**`time_window`** — eligible during a time-of-day range (America/Los_Angeles).

```json
{ "start": "21:00", "end": "23:59" }
```

* Both times are inclusive. If `end < start`, it wraps past midnight.

**`unique_rank_colors`** — eligible when session real users have N distinct rank colors.

```json
{ "min_distinct_colors": 5 }
```

* Evaluated against the `rank_color` of real session members only. Ghost players are excluded.
* Requires at least `min_distinct_colors` distinct values among session members.

### Adding new rule types later

New rule types can be added by defining a new `rule_type` string and a corresponding `rule_payload_json` schema. The evaluator should skip unknown rule types gracefully (log a warning, do not crash). This keeps the system extensible without requiring a migration.

### Evaluation behavior

* Meta rules are evaluated **per-session** on the session page, not globally.
* If a meta badge has multiple rules, **all** must pass (AND logic).
* Eligible meta badges should be surfaced prominently on the session page — they represent time-sensitive or context-sensitive opportunities.

---

## 16. Name display behavior

Each user has a setting:

* show player name
* show real name

This affects how they are rendered in tags, filters, session displays, etc., subject to implementation practicality.

For v1, the simplest interpretation is:

* each user chooses how **their own identity** appears throughout the app
* all UI references to that user respect that chosen display mode

---

## 17. Admin mode and dev/test workflows

## Goals

Make it easy to test edge cases locally and in prod without fighting OAuth or real-world constraints.

Admin mode is a **password-gated mode**, not an account or a role. It is completely separate from the superuser role. A superuser like `kyle.murray100` has elevated in-app powers (editing others' data, viewing feedback, etc.), but admin mode is the gate for test-user tooling and dev cheats. They are independent concepts.

## How admin mode works

1. On the login page, there is an "Enter Admin Mode" option.
2. The user enters the admin mode password (sourced from an environment variable, compared via hash).
3. If correct, the browser session is flagged as being in admin mode.
4. Admin mode presents a test-user panel: create new test accounts or log in as existing ones.
5. Once logged in as a test user, the app behaves normally — but only test-world data is visible.

## Admin mode features

* create test accounts (text-only, no OAuth)
* log in as any test account
* all test accounts are superusers
* override time/date for session expiry testing
* override scores for testing
* manipulate session states
* create sample sessions quickly
* trigger score sync manually
* inspect scrape failures

## Data isolation rules

* test users (`is_test_user = true`) and real users (`is_test_user = false`) exist in fully separate data worlds
* all user-facing queries must respect this boundary: sessions, session members, badge completions, badge comments, difficulty ratings, feedback, profile lists, etc.
* the badge catalog (the badges themselves) is shared — badges are not user-specific
* per-user data layered on top of badges (completion, difficulty, comments) is isolated
* this prevents test data from appearing in the real experience and vice versa

### Implementation strategy

Isolation is derived from the **current user's `is_test_user` flag**, not from per-entity flags on every table.

* The current user's `is_test_user` value determines which "world" they see.
* All queries that return user-related data (sessions, comments, badge statuses, feedback, profile lists, etc.) must join through to `users` and filter to only include users where `is_test_user` matches the current user's value.
* For **sessions**: a session belongs to the test world if its `created_by_user_id` points to a test user. Filter sessions by checking `created_by_user_id -> users.is_test_user`. Session members should already be from the same world since only same-world users are visible when adding members.
* For **badge_user_status**, **badge_comments**, **feedback_posts**: filter by `author_user_id -> users.is_test_user` or `user_id -> users.is_test_user`.
* A helper function (e.g. `getIsolationFilter(currentUser)`) should be used consistently across all data-access code to avoid missing a filter. A single missed filter is a data leak between worlds.
* Do **not** add redundant `is_test` columns to every table — derive it from the user FK. This keeps the schema simple and avoids sync bugs.

## Safety rules

* admin mode features must be hidden behind the admin mode password gate
* test users must be clearly labeled in DB and UI
* test data should be distinguishable at a glance
* test users should not get real score sync by default
* the admin mode indicator should be visible whenever admin mode is active

---

## 18. Importing the existing badge tracker

The uploaded badge tracker (`badges.csv`) should seed the `badges` table.

### What the CSV actually contains

The current CSV has **three columns only**:

| Column | Maps to |
|---|---|
| `Number` | `badge_number` |
| `Name` | `name` |
| `Description` | `description` |

That's it. The CSV does **not** contain rooms, games, player count info, tags, difficulty, duration, per-visit status, or meta-badge flags.

### Import defaults for missing fields

All fields not present in the CSV should be set to sensible empty/unknown defaults on import:

* `rooms` = `[]`
* `games` = `[]`
* `player_count_bucket` = `none`
* `tags` = `[]`
* `default_difficulty` = `unknown`
* `duration_label` = `null`
* `is_per_visit` = `false`
* `is_meta_badge` = `false`
* `active` = `true`

### Backfilling after import

Superusers can fill in the missing fields (rooms, games, tags, difficulty, player count bucket, per-visit, meta-badge) later via in-app maintenance tooling. This is expected — the CSV is intentionally sparse.

Some badges can be partially inferred from their descriptions (e.g. badge #18 "CHASING RAINBOWS" clearly involves 5 players and is a meta badge; badge #34 "EARLY BIRD" involves a time window). But automated inference is **not required** — manual superuser backfill is acceptable for v1.

### Other import notes

* If a future CSV version adds more columns, the importer should handle them gracefully (import what exists, default the rest).
* The CSV does not contain per-user completion data. Canonical per-user completion lives in `badge_user_status`, not in the badge import.
* Re-importing the CSV should be idempotent — update existing badges by `badge_number`, do not create duplicates.

---

## 19. API / server-action responsibilities

Exact implementation style can be server actions or route handlers, but these are the logical operations needed.

## Auth/user operations

* sign in with Google
* activate admin mode (password check, sets session flag)
* complete onboarding/link Activate profile
* create test user / log in as test user (admin mode only)
* update display name mode
* update user role (superuser only)
* edit user score (superuser)
* run initial score sync
* run daily score sync
* view score sync failures (superuser)

## Badge operations

* list badges with filters
* fetch badge detail
* update own badge status
* superuser update any user badge status
* update own difficulty
* update own ideal player count bucket
* create badge comment
* edit own badge comment
* react to comment
* pin/unpin comment (superuser or at least elevated roles)
* create/update badge catalog fields (including `rooms` and `games`) and badge metadata/rules (superuser)

## Session operations

* create session
* add/remove session members
* add/remove ghost members
* fetch session
* fetch session recommendations for current viewer
* select/unselect badge in session
* complete session
* acknowledge/review session
* mark badges complete from session review
* list session history

## Feedback operations

* create feedback post
* edit own feedback post
* react to feedback post
* list feedback posts (superuser only)
* update feedback status (superuser)

---

## 20. Suggested implementation notes

## Scraping implementation

The score lookup page may require robust UI interaction. Use a dedicated scraping module, likely Playwright-based, if plain HTTP parsing is unreliable.

Keep this code isolated from core app logic.

Recommended pattern:

* `lib/activate-scraper/*`
* `lib/score-sync/*`

## Time zone handling

Use the site's canonical timezone for session expiry:

* **America/Los_Angeles**

Sessions expire relative to that timezone, not server UTC alone.

## Soft deletion

Optional but useful for comments and feedback posts.

## Audit friendliness

Even though this is a tiny app, store timestamps everywhere. They are cheap and will help when debugging confusing behavior.

---

## 21. UX priorities

This app should feel simple and useful, not overbuilt.

Prioritize:

* fast badge filtering
* clean session planning
* obvious distinction between "your recommendations" and "shared group plan"
* minimal friction to mark badges complete
* strong visibility into who has selected or completed something
* low-risk maintenance tools for score and badge cleanup

Do not overcomplicate:

* comments
* feedback
* role system
* scraping infrastructure
* abstract future-proofing

---

## 22. Recommended v1 milestone breakdown

## Phase 1: foundation

* set up Next.js/Auth.js/Prisma/Postgres
* Google login
* admin mode (env-hashed password, session flag, test-user panel)
* user model (`auth_type`: `google` | `test`; `role`: `user` | `superuser`)
* data isolation between test and real users
* badge import
* basic badge list page
* badge detail page
* own badge status editing

## Phase 2: session core

* session create/view
* session members and ghost members
* your badges recommendation view
* group badges shared view
* session history
* session completion prompts

## Phase 3: collaboration + maintenance

* badge comments + reactions + pinning
* feedback submission + dashboard
* role management (superuser)
* superuser edit powers
* score scraping + daily sync
* admin mode dev cheats (time override, score override, etc.)

---

## 23. Non-goals / anti-patterns

Do not do these in v1:

* do not turn this into a generic social app
* do not model multiple organizations/groups
* do not store badge completion directly on badges
* do not couple app functionality to scraping success
* do not make one universal session suggestion list for all users
* do not give ghost players any real badge state
* do not silently auto-award badges on session completion
* do not let bad scrape results overwrite good data

---

## 24. Final product summary

The app is a small private planner/tracker for one Activate friend group.

The most important product ideas are:

* **badges are per-player**
* **sessions are shared, but recommendations are user-specific**
* **ghost players only affect headcount**
* **group planning is separate from individual recommendation logic**
* **score scraping is helpful but non-critical**
* **superusers can repair core data**
* **admin mode enables isolated test workflows without an admin account**
* **test and real data are fully isolated from each other**
* **feedback exists, but a full social page does not**

That should be the guiding philosophy of the implementation.
