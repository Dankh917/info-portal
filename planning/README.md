# InfoPortal Work Plan

This folder is the working source of truth for improvement work.
When I make changes in this repo, I will track against this plan.

## 1. Priority Demo-Risk Fixes

These are highest priority before your executive call.

1. [x] Protect document download access checks
   - File: `src/app/api/documents/[id]/route.js`
   - Issue: Route currently serves files without re-checking auth/visibility.
   - Goal: enforce authentication and the same visibility rules used in `/api/documents`.
   - Status: Done

2. [x] Prevent accidental tag wipe on project edit
   - File: `src/app/api/projects/[id]/route.js`
   - Issue: PATCH can overwrite tags when `tags` is omitted.
   - Goal: only update tags when explicitly provided in payload.
   - Status: Done

3. [x] Fix undefined client logger usage
   - File: `src/app/project-search.js`
   - Issue: `logClientError(...)` is called but not defined/imported.
   - Goal: add a safe logger helper or replace with guarded `console.error`.
   - Status: Done

4. [x] Correct documentation project filtering logic
   - File: `src/app/documentation/page.js`
   - Issue: "user projects" filter currently includes projects with any assignment.
   - Goal: filter by the current logged-in user assignment only.
   - Status: Done

5. [x] Resolve lint-blocking errors
   - Files:
     - `src/app/profile/[username]/edit/page.js`
     - `src/app/user-menu.js`
   - Issues:
     - unescaped apostrophe in JSX text
     - use of `<a>` for internal navigation instead of `Link`
   - Goal: lint clean on errors (warnings can be handled next).
   - Status: Done (`npm run lint` has 0 errors)

6. [x] Stabilize Google Calendar token behavior
   - Files:
     - `src/lib/google-calendar.js`
     - `src/app/api/calendar/route.js`
   - Issue: repeated "Google refresh token is missing" error for some users.
   - Goal: graceful fallback + user guidance + reduced noisy failures.
   - Status: Done

7. [x] Fix "Latest updates" sort order
   - File: `src/app/page.js`
   - Issue: feed labeled latest but sorted oldest-first.
   - Goal: show newest first by default.
   - Status: Done

8. [x] Harden Google Calendar reconnect flow (403 fix)
   - Files:
     - `src/auth.js`
     - `src/app/login/page.js`
     - `src/app/user-menu.js`
     - `src/app/calendar/page.js`
   - Issue: users could still get 403 after reconnect because account token/scope records were stale.
   - Goal: ensure reconnect requests consent/offline/calendar scopes and sync latest Google account tokens on sign-in.
   - Status: Done

9. [x] Collapse oversized update messages with expand/close controls
   - File: `src/app/page.js`
   - Issue: very large update messages could overwhelm and visually break the updates feed.
   - Goal: keep long messages collapsed by default, allow explicit `Expand`, and provide `Close` to collapse again.
   - Status: Done

10. [x] Keep updates/favorites columns balanced at 50/50 on desktop
    - File: `src/app/page.js`
    - Issue: favorites panel could get squeezed when update content was very wide.
    - Goal: enforce equal desktop column widths and prevent content-driven layout squeeze.
    - Status: Done

11. [x] Expose project status controls in UI (including blocked)
    - File: `src/app/projects/page.js`
    - Issue: API supported `blocked` status but projects UI had no status selector.
    - Goal: allow admins/PMs/owners to set status from the project edit flow and clearly display status on cards/details.
    - Status: Done

## 2. High-Impact Product Improvements (Non-AI)

1. [x] Executive dashboard
   - File: `src/app/page.js`
   - Scope: blocked projects, due-in-7-days view, department activity, and risk highlights.
   - Status: Done

2. Notification preferences
   - Per department/project subscriptions and critical-only mode.

3. Approval workflow for major updates
   - Draft -> review -> publish for sensitive announcements.

4. Audit timeline
   - Track role changes, assignment updates, and key actions.

5. Frontend maintainability refactor
   - Break up very large pages into smaller feature components.
   - Primary candidates:
     - `src/app/page.js`
     - `src/app/projects/page.js`

## 3. AI Feature Roadmap

1. [x] Executive Briefing Agent
   - Daily "what matters today" summary from updates, projects, and calendar.
   - Status: Done

2. [x] Ask-the-Portal Assistant
   - Natural-language Q&A over docs, updates, projects, and directory with citations.
   - Status: Done

3. Meeting-to-Action Agent
   - Convert meeting notes/calendar context into draft updates and assignments.

4. Risk Radar Agent
   - Early warnings for likely delays based on blocked/overdue/instruction signals.

5. Expert Finder
   - "Who can help with X?" based on profiles, projects, and uploaded documents.

## 4. Market Context to Mirror

Recent relevant trends to align messaging and roadmap:

1. Agentic workflows and tool-using assistants
2. Multi-agent orchestration in enterprise products
3. Deep connectors to internal systems
4. AI meeting intelligence turned into concrete actions
5. AI companions becoming visible product experiences for business users

## 5. Delivery Sequence

Recommended execution order:

1. Complete all Priority Demo-Risk Fixes
2. Add Executive dashboard baseline
3. Build one AI feature MVP (Executive Briefing Agent)
4. Iterate on AI assistant and meeting/action workflows
