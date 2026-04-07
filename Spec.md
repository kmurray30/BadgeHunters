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
8. Support admin/superuser maintenance tools and test/dev mode.
9. Include a lightweight feedback feature visible only to admins and superusers.

This spec is for **v1** only.

---

## 2. Product scope

## In scope for v1

* Google OAuth login only
* Activate username/account linking during signup
* Score scraping from `https://playactivate.com/scores`
* Daily retryable score sync, isolated so app functionality does not depend on it
* Manual score editing by admins and superusers
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
* Feedback submission page plus admin/superuser feedback dashboard
* Admin mode and test users
* Dev/test cheats such as fake users, time override, score override, etc.

## Explicitly out of scope for v1

* Public social feed
* Multiple friend groups / organizations / clubs
* Multiple auth providers
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
* **Auth:** Auth.js / NextAuth with Google provider
* **Hosting:** Vercel
* **Database hosting:** Supabase Postgres
* **Cron/background work:** Vercel Cron for daily score sync
* **Scraping:** isolated server-side scraping module using Playwright or another browser automation tool if necessary

This stack is acceptable and not overkill for this project. It is slightly more infrastructure than strictly necessary, but still a clean, boring choice.

---

## 4. Roles and permissions

There are three roles.

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

* edit other users’ badge status
* edit other users’ scores
* access admin tools
* access feedback dashboard

## superuser

Can do everything a normal user can, plus:

* edit any user’s badge status
* edit any user’s score
* access feedback dashboard
* view all submitted feedback

Cannot:

* manage admin-only settings unless explicitly allowed
* use admin-only cheat/dev tools unless explicitly granted

## admin

Can do everything a superuser can, plus:

* manage superusers
* access admin login path
* create/manage test users
* use dev/test cheats
* override time/date for testing
* override scores for testing
* control score sync behavior manually
* edit protected site settings
* impersonate/force-login test users if implemented
* manage pinned system/test fixtures if implemented later

Seed:

* `kyle.murray100` should be seeded as a **superuser**
* at least one actual Google-authenticated account should be seeded or elevated to **admin**

---

## 5. Authentication and signup

## Login methods

Two auth modes exist:

1. **Google OAuth login** for real users
2. **Admin-only test login path** for fake/test users

These are distinct.

## Google login flow

1. User clicks “Sign in with Google”.
2. After Google auth succeeds, the app asks for:

   * real name
   * Activate player name (or attempts account lookup first using Google email)
3. The app checks `https://playactivate.com/scores` using the Google email first.
4. If an account is found, show:

   * “Are you `<playername>`?”
5. If user confirms, link that Activate player.
6. If not found, or user says no:

   * ask user to enter their Activate player name
   * validate it against the Activate score page
7. If valid, create/link the account.
8. Immediately attempt initial score scrape after linking.

Important:

* The score lookup is an **enrichment step**, not a hard dependency for the app to function.
* If validation is flaky or scrape fails temporarily, do not corrupt data.
* If signup validation fails in a weird way, it is acceptable to let an admin/superuser fix the account later.

## Test login flow

Visible only behind an **Admin Login** option on the login page.

Admin can create/log in as a **test user** using only:

* Activate player name

Rules:

* Test login is separate from OAuth
* Test users must be clearly marked in DB and UI
* Test users can exist in prod and local
* Test users should not participate in real score sync unless explicitly enabled
* Test users should be visually labeled as test accounts

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

* attempt to scrape each eligible real user’s Activate score
* validate returned data
* only update the score if the result looks sane

If scrape fails or returns weird/untrusted data:

* store sync failure log
* keep last known good score
* do not overwrite with bad data

## “Weird number” validation

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

Superusers and admins can manually edit user scores.

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

Represents all users, both real and test.

Fields:

* id
* email (nullable for test users)
* auth_type (`google` | `test`)
* role (`user` | `superuser` | `admin`)
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
* superusers/admins can edit anyone’s row
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
* admins/superusers may edit/delete/moderate if needed
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

Represents a single day’s outing / planning session.

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
* only superusers/admins may view feedback dashboard

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
* `admin`

### auth_type enum

* `google`
* `test`

### display_name_mode enum

* `player_name`
* `real_name`

---

## 9. Pages and UX

## 9.1 Login page

Features:

* Sign in with Google
* Admin Login option
* clear separation between real login and admin/test path

Admin path:

* admin authentication gate
* access to test-user login/create flow

## 9.2 Onboarding / account linking page

Shown after first Google login if account is not fully linked.

Flow:

* collect real name
* try Activate lookup by Google email
* if found, ask “Are you `<playername>`?”
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
* by “only badges I haven’t completed”
* by “only badges selected session users haven’t completed” if session context exists
* search by name/description

Role-based edit behavior:

* normal users can edit their own badge status/difficulty
* superusers/admins can edit any user’s badge status and scores
* badge row dropdown may expose admin/superuser tools if needed

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
* admin/superuser edit controls if authorized

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

* only superusers and admins can view feedback posts

Features:

* lightweight posts/messages
* edit own feedback
* reactions
* optional status fields like open/addressed/archived

This replaces the broader social page.

## 9.10 Admin tools page

Admin-only.

May include:

* create test user
* log in as test user / impersonate
* time override
* score override
* trigger/resume score sync
* edit roles
* add/remove superusers
* inspect scrape failures
* edge-case helpers for sessions and badges

Must be clearly marked as admin/test tooling.

---

## 10. Badge display and difficulty rules

## Displayed difficulty precedence

For the currently logged-in user, a badge’s displayed difficulty should be:

1. **Your difficulty**, if you have rated it
2. Else **community average**, if at least one user vote exists

   * include the default difficulty as one vote if the default difficulty is not `unknown`
3. Else **default difficulty**
4. If default is `unknown` and there are no user votes, display `???`

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

## “Your badges” base filter

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
* all badges you haven’t done

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

Recommended layout inside “Your badges”:

* per-visit recommended badges
* normal recommended badges

## Suggested ranking order for “Your badges”

Within each section, sort roughly by:

1. badges matching strongest shared-uncompleted condition
2. number of other real session users who have not completed it, descending
3. player-count bucket boost
4. difficulty ascending, with `unknown` last
5. optional duration tie-breaker later

This does not need to be mathematically perfect. It should be deterministic and understandable.

---

## 12. Session selection behavior

Users select badges from their own “Your badges” page.

Those selections appear in the shared “Group badges” page.

Rules:

* users can select or unselect badges independently
* same badge can be selected by multiple users
* group page aggregates selectors
* no duplication between “yours” and “others” sections for the same viewer
* viewer sees their selected badges in “yours”
* badges only selected by other users appear in “others”

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

   * “`<player>` has completed the session. Complete session and update badges?”
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

Superusers/admins can edit anyone’s status.

---

## 15. Meta badges

Meta badges are stored as normal rows in `badges`, but dynamic eligibility is determined by `badge_meta_rules`.

Examples:

* last day of month
* time of day
* party of 5 with all different rank colors

The session creation/page flow should evaluate meta rules and surface any currently eligible meta badges.

### Example meta rule: 5 unique rank colors

Interpretation:

* rank color changes each 100k score band
* a valid 5-player group requires five distinct 100k ranges across the participating real users

Ghost players do not count unless explicitly changed later.

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

## 17. Admin and dev/test mode

## Goals

Make it easy to test edge cases locally and in prod without fighting OAuth or real-world constraints.

## Admin-only dev features

* create fake/test users
* log in as fake/test users
* test signup with only Activate player name
* manually set or override scores
* manipulate time/date for session expiry testing
* manipulate session states
* impersonate or act as users if implemented
* create sample sessions quickly
* trigger score sync manually
* inspect scrape failures

## Safety rules

* all admin/test features must be hidden behind admin-only access
* test users must be clearly labeled
* test data should be distinguishable in DB and UI
* test users should not get real score sync by default

---

## 18. Importing the existing badge tracker

The uploaded badge tracker should seed the `badges` table.

Expected imported concepts include:

* badge number
* name
* description
* room(s)
* game(s)
* player count info
* tags
* default difficulty
* duration
* completion column if present only as import context, not canonical truth

Important:

* the CSV’s user-specific completion column is **not** the long-term system of record
* canonical per-user completion lives in `badge_user_status`

Admin tooling should allow adding/updating badges later as needed.

---

## 19. API / server-action responsibilities

Exact implementation style can be server actions or route handlers, but these are the logical operations needed.

## Auth/user operations

* sign in with Google
* complete onboarding/link Activate profile
* create test user
* admin test login
* update display name mode
* update user role (admin only)
* edit user score (superuser/admin)
* run initial score sync
* run daily score sync
* view score sync failures (admin)

## Badge operations

* list badges with filters
* fetch badge detail
* update own badge status
* superuser/admin update any user badge status
* update own difficulty
* update own ideal player count bucket
* create badge comment
* edit own badge comment
* react to comment
* pin/unpin comment (superuser/admin or at least elevated roles)
* create/update badge metadata/rules (admin)

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
* list feedback posts (superuser/admin only)
* update feedback status (superuser/admin)

---

## 20. Suggested implementation notes

## Scraping implementation

The score lookup page may require robust UI interaction. Use a dedicated scraping module, likely Playwright-based, if plain HTTP parsing is unreliable.

Keep this code isolated from core app logic.

Recommended pattern:

* `lib/activate-scraper/*`
* `lib/score-sync/*`

## Time zone handling

Use the site’s canonical timezone for session expiry:

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
* obvious distinction between “your recommendations” and “shared group plan”
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
* user model
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
* role management
* superuser/admin edit powers
* score scraping + daily sync
* admin/dev mode and test users

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
* **superusers/admins can repair core data**
* **feedback exists, but a full social page does not**

That should be the guiding philosophy of the implementation.
