# Comet Academy Repository Instructions

These instructions apply to all automated agents and Copilot sessions working in this repository.

## Project Identity

- Product name: Comet Academy.
- Repository: `blitznihar/tanstack-starring`.
- Runtime: Bun.
- Framework: TanStack Start, React, TanStack Router, TypeScript strict, Vite.
- Database: MongoDB through `src/repositories/*`.
- Validation: Zod schemas in `src/schemas/*` and server-function validators.
- Tests: Vitest with V8 coverage.
- Deployment: Vercel, Docker, and optional Electron desktop shell.
- External services: OpenAI, Auth0, Stripe, SMTP, New Relic.

## Non-Negotiable Rules

- Do not read, print, copy, or commit secrets from `.env`.
- Keep real secrets only in GitHub, Vercel, Auth0, Stripe, SMTP, OpenAI, MongoDB Atlas, or New Relic secret stores.
- Never expose server-only secrets to browser bundles.
- Do not bypass the repository layer for MongoDB access.
- Do not replace TanStack Start, Bun, Vite, MongoDB, or the current architecture.
- Do not hand-edit `src/routeTree.gen.ts` unless route generation is unavailable and a tiny unblock is required. Prefer running `bun run build`.
- Preserve existing user changes in the working tree.
- Prefer small, focused changes with tests that cover changed behavior.

## Architecture Boundaries

- `src/domain/*`: pure business logic. No network, MongoDB, cookies, server functions, or UI imports.
- `src/schemas/*`: Zod contracts for persisted and imported data.
- `src/repositories/*`: the only place that should use MongoDB driver calls.
- `src/server/*`: authenticated server services, integrations, and side effects.
- `src/server/rpc/*`: TanStack Start server functions used by routes.
- `src/routes/*`: page-level route components and route loaders.
- `src/components/*`: shared UI components.
- `src/styles/global.css`: global styling and design tokens.
- `scripts/*`: operational scripts and one-off CLI entrypoints.
- `tests/*`: Vitest test suites.

## Database Rules

- Local, Vercel preview, and non-production environments use the `comet-dev` database.
- Vercel production uses the `comet` database.
- The `MONGODB_URI` selects the MongoDB server or Atlas cluster; app code derives the database name by environment.
- Do not hardcode collection names outside repositories.
- Keep student state keyed by stable identifiers such as `studentId`, `enrollmentId`, `workDate`, `subject`, `standardCode`, and item type.

## Student Learning Rules

- A lesson must be complete before its matching practice can be started.
- Practice completion requires all visible required questions to be answered.
- Completing a lesson should take the student to its matching practice when that practice is next.
- Completing practice should persist completion and return the student to the dashboard.
- Dashboard work is derived from ordered schedule tasks.
- Completed lessons and practices must remain viewable from dashboard/history.
- Practice review mode must be read-only and must not award or deduct Robux again.
- Answer attempts and Robux ledger changes must be idempotent.
- Single-choice scoring requires exact key equality.
- Multi-select scoring requires exact set equality. Extra or missing choices are wrong.

## Scheduler Rules

- Program schedules are program-day based, not just calendar-day based.
- Lesson days teach topics with practice. Topic and practice are not separate concepts in the scheduler.
- Exams are allowed on configured exam slots and after enough topics are taught.
- Sick/off days stretch the calendar and do not break streaks.
- Acceleration compresses the schedule.
- Completed days must stay visible in dashboard/history, while the next scheduled day is the next launch target.

## OpenAI and AI Scoring

- Runtime AI scoring uses OpenAI only.
- The model is `gpt-5.4-mini`.
- If OpenAI is disabled or unavailable, written SCR/ECR responses must fall back to manual scoring.
- Never block student submission on AI scoring.
- Do not send secrets, session tokens, or unrelated student data to OpenAI.

## Auth0 Rules

- Auth0 is the login provider for existing users.
- Google login is allowed only for Gmail accounts that already exist in the backend.
- New users cannot self-sign-up unless their Gmail account is already present in backend user records.
- Callback and logout URLs must match configured Auth0 application settings.

## Stripe Rules

- Stripe handles real card collection. The server must never receive raw card data.
- Demo mode is acceptable when Stripe keys are placeholders.
- Production payment state must be driven by verified Stripe events or explicit demo/admin actions.

## Observability Rules

- New Relic is opt-in through environment variables.
- New Relic license keys are secrets and must never enter browser code.
- `/health` must be safe and must not expose secrets, database content, or personally identifiable information.

## Required Checks

Run the smallest meaningful check while iterating, then run the full gate before finishing significant work:

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

Known current lint behavior: lint may report existing warnings for unused underscore-prefixed destructuring variables. Do not add new warnings.

## Delivery Notes

- Summarize changed files and tests run.
- Call out any manual setup in GitHub, Vercel, Auth0, Stripe, MongoDB Atlas, SMTP, Codecov, or New Relic.
- When a local dev server is useful, run it on `5173` unless the user asks otherwise.
