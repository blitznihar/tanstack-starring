# STAAR Practice Platform Prototype Delta Report

Date: 2026-06-19

Authoritative reference:
- `Staar/STAAR Practice Platform.standalone-src.html`
- `Staar/STAAR Practice Platform (standalone).html`
- `Staar/screenshots/*.png`
- `INSTRUCTION.md` section 21

## Executive Summary

The current TanStack app is not at prototype parity. The backend/domain test suite is healthy, but the UI that Business saw is a smaller route-based implementation rather than the full standalone prototype experience. This is a release-blocking expectation gap because `INSTRUCTION.md` states that the `Staar/` prototype is the source of truth for look, layout, labels, screens, and interactions.

The most urgent issues are:

1. Reports / Parent is much thinner than the prototype and misses the parent dashboard layout Business expected.
2. Redemptions exist in pieces, but not as the prototype's student modal plus admin redemptions tab experience.
3. Parent navigation exposes admin-only routes from Billing and can send a parent into failing/admin-only sections.
4. The reported `top.updatedAt.toISOString is not a function` crash is addressed in this checkout by date coercion, but it needs a deployed-build verification and a regression test because it directly matches the demo failure.
5. The admin console is fragmented into separate routes and is missing major prototype tabs/features: Users, Programs, Exams, Scheduler, and the unified tabbed console shell.

## Verification Performed

Commands:
- `bun run typecheck` passed.
- `bun test` passed: 145 tests, 0 failures.
- `bun run seed` completed against the existing local MongoDB container.
- `bun run dev -- --host 0.0.0.0` started successfully.

Live smoke notes:
- Parent login -> `/dashboard` loaded without reproducing `top.updatedAt.toISOString`.
- Parent `/billing` loaded, but displayed admin-only navigation links: Content, Rewards, Scoring, Reports, Profile I/O, Billing.
- Clicking parent-visible `Rewards` from Billing caused the browser automation session to hang rather than producing a clean parent-safe page. This is consistent with a parent being routed into an admin-only redemption surface.

## Evidence References

- Source-of-truth requirement: `INSTRUCTION.md` section 21 says the real app must match `Staar/` exactly and lists the required screen map.
- Prototype Parent Dashboard: `Staar/STAAR Practice Platform.standalone-src.html` around the Parent Dashboard block includes Day/Week/Month, KPI row, billing strip, heatmap, exam chart, activity log, Robux history, and topics.
- Prototype Admin Console: `Staar/STAAR Practice Platform.standalone-src.html` around the Admin Console tab block lists Users, Programs, Content, Exams, Scoring review, Redemptions, Billing, and Profiles.
- Prototype Wallet/Redemption: `Staar/STAAR Practice Platform.standalone-src.html` around the Wallet block includes the redeem modal, My redemptions, earn history, and Big goals & rewards.
- Current route inventory: `src/routeTree.gen.ts` lists only the route set captured below, with no staff Scheduler route or unified Admin Console tab route.
- Current Reports implementation: `src/routes/dashboard.tsx` renders a compact metric/per-program list rather than the prototype dashboard.
- Current Parent navigation issue: `src/routes/billing.tsx` renders admin links unconditionally in the Billing header.
- Current date-crash mitigation: `src/server/reporting/reporting.ts` uses `toIso(top.submittedAt ?? top.updatedAt)` instead of direct `updatedAt.toISOString()`.

## Crash Report: `top.updatedAt.toISOString is not a function`

Observed user-facing error:

```text
Something went wrong!
top.updatedAt.toISOString is not a function
```

Likely failure path:
- Route: Reports / Parent dashboard (`/dashboard`)
- Data path: latest submitted exam in reporting
- Old behavior: code likely called `top.updatedAt.toISOString()` directly.
- Failure condition: `updatedAt` persisted or transported as a string/object instead of a `Date`.

Current checkout status:
- `src/server/reporting/reporting.ts` now uses `toIso(top.submittedAt ?? top.updatedAt)`.
- `src/lib/dates.ts` safely accepts `Date`, ISO string, epoch number, and malformed values.
- Live smoke test did not reproduce the crash.

Action items:
- Add a reporting regression test with `updatedAt` as a string and as a malformed object.
- Verify the deployed/demo build includes the `toIso` fix.
- Add a route-level smoke test for `/dashboard` after seeding an exam session with serialized timestamps.
- Add a custom route error boundary so future loader crashes do not show raw TanStack "Something went wrong" output to Business users.

## Route Inventory Delta

Current route tree contains:
- `/`
- `/plan`
- `/practice`
- `/wallet`
- `/exam/$sessionId`
- `/dashboard`
- `/scoring`
- `/billing`
- `/admin/content`
- `/admin/rewards`
- `/admin/profile`

Prototype admin/parent world expects:
- Parent Dashboard
- Admin Console tab shell
- Users tab
- Programs tab
- Content tab
- Exams tab
- Scoring review tab
- Redemptions tab
- Billing tab
- Profiles tab
- Scheduler screen
- Supporting modals: create user, password once, fulfill redemption, import profile, refill prompt, add reward, generate new-program prompt, subscribe, payment, add program, upload, add problems/exam.

Impact:
- The current app has working backend pieces and some route pages, but it does not match the prototype's screen map, navigation model, or visual hierarchy.

## Reports / Parent Delta

Prototype expectation:
- Parent top-level dashboard only shows parent-safe navigation.
- Day / Week / Month segmented control.
- KPI row: Skills mastered, Needs work, Day streak, Robux available.
- Parent billing strip with invoice/card affordance.
- TEKS mastery heatmap.
- Exam scores over time chart.
- Activity log.
- Robux history.
- Topics done/remaining summary.

Current implementation:
- `/dashboard` shows a generic "Comet Family" report.
- Metrics are Topics mastered, Robux available, Lifetime Robux, Programs.
- Per-program cards show latest exam summary and remaining topics.
- Missing heatmap, day/week/month filters, activity log, exam trend chart, parent billing strip, and prototype layout.

Action items:
- Port the prototype parent dashboard structure and styling directly.
- Extend reporting API to return:
  - range filter: day/week/month
  - heatmap cells by TEKS/mastery state
  - exam score trend series
  - activity log
  - Robux ledger summary
  - topics done/remaining counts
  - parent billing summary
- Add `/dashboard` route tests for parent and admin roles.
- Add screenshot checks against `Staar/screenshots/*v2/v3/v4*` dashboard states.

Acceptance criteria:
- Parent sees only parent-appropriate navigation.
- Parent dashboard visually matches the standalone prototype parent dashboard.
- Reports load even with serialized dates and empty/missing exam data.
- Day/week/month filters change the reported range without a page crash.

## Redemptions Delta

Prototype student wallet expectation:
- "Available to spend" hero card.
- "Redeem a reward" modal.
- Earn history.
- My redemptions.
- Big goals & rewards with progress bars.
- Standard redemption catalog includes "Roblox: 1,000 Robux".

Current student wallet:
- `/wallet` has available/lifetime cards, catalog cards, requests, history, and goals.
- It is not the same prototype interaction: catalog is inline instead of the prototype modal entry flow.
- The wallet uses the first active enrollment only, not a clear per-enrollment/prototype model.

Prototype admin redemptions expectation:
- Redemptions live inside the Admin Console tab shell.
- Robux earning rules are visually separated from reward rules.
- Admin can approve requested redemptions.
- Admin can mark approved redemptions fulfilled with partial amounts.
- Shows Maya's available balance.

Current admin rewards route:
- `/admin/rewards` combines earning rules, reward rules, and pending redemptions.
- It is separate from the prototype Admin Console tab shell.
- It lists only requested/approved redemptions, not a fuller redemption history.
- Parent can see a Rewards link from `/billing`, then enters a broken/admin-only path.

Action items:
- Hide admin redemption/reward links for parent in all shared headers.
- Add a clean 403/Not Authorized route state for forbidden admin loaders.
- Port the student redemption modal UI from the prototype.
- Port the Admin Console -> Redemptions tab from the prototype, reusing existing server functions.
- Show fulfilled/denied history separately from pending queue.
- Add e2e coverage: student requests -> admin approves -> admin partially fulfills -> wallet updates.

Acceptance criteria:
- Student redemption request works from the prototype modal.
- Parent never sees admin redemption configuration links.
- Admin/Super Admin redemptions tab matches the prototype and supports partial fulfillment.
- Fulfillment books the ledger reset and appears in student "My redemptions."

## Parent Role Delta

Prototype expectation:
- Parent has a calm read-only dashboard.
- Parent can pay invoices.
- Parent does not see admin console tabs or configuration surfaces.

Current implementation:
- `/dashboard` is parent-safe, but too thin.
- `/billing` header is not parent-safe and exposes admin-only links.
- `/scoring` link is visible to parent. This may be allowed by RBAC for score override, but it should be represented intentionally and not mixed with admin navigation.

Action items:
- Create a shared role-aware header/navigation component.
- Audit every route header for role-gated links.
- Add route-level authorization UX for forbidden pages.
- Add parent smoke test: login parent -> dashboard -> billing -> payment modal -> no admin links.

Acceptance criteria:
- Parent navigation exactly matches prototype parent navigation.
- Parent cannot click into admin content/rewards/profile routes.
- Parent payment flow remains accessible and working.

## Admin Console Delta

Prototype expectation:
- Unified Admin Console with tabs:
  - Users
  - Programs
  - Content
  - Exams
  - Scoring review
  - Redemptions
  - Billing
  - Profiles
- Separate Scheduler screen accessible to staff.

Current implementation:
- Admin functionality is split across routes:
  - `/admin/content`
  - `/admin/rewards`
  - `/scoring`
  - `/billing`
  - `/admin/profile`
- Missing or incomplete UI surfaces:
  - Users management
  - Programs management
  - Exam configuration
  - Out-of-cycle exam scheduling
  - Staff Scheduler route
  - New program prompt modal
  - Import bundle/upload modal
  - Password-once modal

Action items:
- Build an `AdminConsole` route/shell that owns the prototype tab set.
- Move existing Content, Rewards, Scoring, Billing, and Profiles screens into tabs or shared components.
- Implement missing Users, Programs, Exams, and Scheduler surfaces.
- Keep route aliases if needed, but make the tab shell the primary UI Business sees.

Acceptance criteria:
- Admin/Super Admin first landing matches the prototype Admin Console.
- All prototype tabs exist and are clickable.
- Existing server functions remain behind RBAC.
- No tab shows a generic route crash on missing data.

## Content / Checks Delta

Prototype expectation:
- Content/checks shows program/grade tabs and college/grad prep as separate programs.
- Bundle list has "View N items".
- Item bank drill-in shows exhausted/low pool summary.
- Per-concept practice question and exam minute steppers.
- Refill prompt and upload/import controls.

Current implementation:
- `/admin/content` lists programs and bundles.
- Bundle drawer shows pools and item details.
- Refill prompt exists.
- Missing visible import/upload workflow.
- Missing prototype concept steppers for practice count and exam minutes in the content drill-in.
- Visual layout is not the prototype checks screen.

Action items:
- Port content/checks layout and state model.
- Add import bundle/upload modal.
- Expose per-concept practice count and exam minute steppers using existing `program.conceptConfig`.
- Add screenshot diff against `checks` and `genprompt`.

## Exams / Scheduler Delta

Prototype expectation:
- Exams tab supports duration presets, Math/Reading split slider, pure Math, pure Reading, 50/50, live blueprint, break row, out-of-cycle exam scheduling.
- Scheduler screen supports program tabs, off/sick marking, adjustment summary, workload bump/extension visibility.

Current implementation:
- Backend domain/tests cover schedule, off/sick, work-ahead, section break, and exam assembly.
- Student `/plan` exists.
- No staff Scheduler route in the route tree.
- No admin Exams configuration tab in the route tree.

Action items:
- Build Admin Console -> Exams tab.
- Build staff Scheduler screen.
- Wire existing schedule/exam server functions to prototype controls.
- Add route/e2e tests for exam config and out-of-cycle scheduling.

## Design System Delta

Prototype requirement:
- The app must match the standalone prototype: same screens, layout, copy, colors, typography, spacing, icons, and interactions.

Current implementation:
- The app uses similar tokens and fonts, but many screens are simplified cards/routes rather than the prototype DOM/layout.
- Reusable role-world shells are not yet extracted.
- Headers are duplicated per route, causing role/nav drift.

Action items:
- Extract StudentShell, AdminParentShell, AdminConsoleTabs, Card, Metric, Stepper, Modal, Pill, ProgressBar.
- Replace duplicated headers with shared role-aware shells.
- Add visual QA checklist using `Staar/screenshots`.

## Priority Plan

P0 - Stabilize demo paths
- Confirm deployed build includes `toIso` reporting fix.
- Add regression tests for serialized `updatedAt`.
- Hide admin-only links from Parent.
- Add clean forbidden/error UI for admin-only pages.
- Run smoke pass: Parent Dashboard, Billing, Student Wallet, Admin Redemptions.

P1 - Restore Business-facing parity
- Port Parent Reports dashboard.
- Port Student Wallet/Redeem modal.
- Port Admin Console shell with Redemptions tab.
- Reuse existing backend functions where possible.

P1 - Fill missing admin operations
- Users tab.
- Programs tab.
- Exams config tab.
- Staff Scheduler screen.
- Import/upload and new-program prompt modals.

P2 - Visual QA and hardening
- Screenshot compare each screen in `INSTRUCTION.md` section 21.3.
- Add Playwright route smoke tests for each role.
- Add fixture data for non-empty reports, redemptions, scoring jobs, and payments.

## Suggested Ownership

Engineering:
- Date crash regression and route error boundary.
- Role-aware navigation/RBAC UX.
- Admin Console shell and missing tabs.
- API expansions for parent reports.

Product/Business:
- Confirm whether current standalone prototype is still the exact acceptance baseline.
- Rank which prototype screens must be Business-demo-ready first.
- Confirm whether parent should have scoring override visible in navigation.

QA:
- Build a role-based smoke script.
- Capture screenshot parity against each `Staar/screenshots` group.
- Verify redemption end-to-end with ledger balance changes.

## Demo Readiness Checklist

Before the next Business demo:

- Parent role loads dashboard with no crash.
- Parent dashboard matches prototype and includes heatmap, exam trend, activity log, Robux history, topics.
- Parent billing shows no admin-only links.
- Student wallet opens the redeem modal and submits a request.
- Admin/Super Admin can see request in Redemptions, approve it, and fulfill it.
- Reports handle Date/string/malformed timestamp values without crashing.
- Admin Console has the expected prototype tabs, even if some deeper actions are marked as disabled or demo-only.
- All visible screens have been checked against the screenshot map in `INSTRUCTION.md` section 21.3.
