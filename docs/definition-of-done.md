# Definition of Done

Use this checklist before considering Comet Academy work complete.

## Functional Completion

- The requested user behavior is implemented.
- The behavior works for the relevant role:
  - student
  - parent
  - admin
  - super_admin
- Server-side authorization enforces the same permissions shown in UI.
- State persists after refresh, logout/login, route changes, and returning later.
- Error states are handled clearly.
- Empty states are handled clearly.

## Architecture Completion

- Domain logic is in `src/domain` when it can be pure.
- MongoDB access is in `src/repositories`.
- Server workflows are in `src/server`.
- Route-facing functions are in `src/server/rpc`.
- UI is in `src/routes` or `src/components`.
- Zod schemas are updated for persisted/imported/exported data shapes.
- No secrets are exposed to browser bundles or docs.
- `src/routeTree.gen.ts` is regenerated through build tooling when routes change.

## Student Flow Completion

For lesson/practice/dashboard changes:

- Lesson completion unlocks matching practice.
- Practice completion requires all visible required answers.
- Correct/wrong scoring is accurate.
- Robux changes are idempotent.
- Completed work remains visible.
- History links open the selected completed lesson/practice.
- Practice review is read-only and shows prior selections/feedback.
- Tomorrow or next work-day preview is separate from completed current work.

## Scheduler Completion

For schedule changes:

- Sick/off days stretch schedule and do not break streaks.
- Work-ahead progress is saved to the correct work date/list.
- Exam days follow configured exam weekday rules.
- Completed days remain visible in history/dashboard.
- Dates and day labels are clear.

## Billing/Auth Completion

For billing/auth changes:

- Auth0 callback/logout URLs are documented if changed.
- Existing backend user matching is preserved.
- Open signup remains blocked unless explicitly requested.
- Stripe Checkout is used for real card flows.
- Webhooks verify signatures.
- Demo mode remains safe.

## Observability Completion

For monitoring changes:

- `/health` remains safe.
- New Relic remains opt-in.
- No license keys or secrets are in git.
- Errors and failure modes are logged without sensitive data.

## Testing Completion

Run relevant focused tests while developing, then run the full gate before handoff:

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

Expected:

- no type errors
- no lint errors
- no new lint warnings
- tests pass
- build passes
- coverage is not meaningfully reduced

## Documentation Completion

Update docs when changing:

- setup commands
- environment variables
- deployment
- database behavior
- Auth0
- Stripe
- OpenAI
- New Relic
- scheduler semantics
- lesson/practice/dashboard/history behavior

## Handoff Completion

Final response should include:

- concise summary of what changed
- files changed
- checks run
- known warnings or risks
- manual setup still required
