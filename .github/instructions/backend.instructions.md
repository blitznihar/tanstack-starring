---
applyTo: "src/server/**/*.ts,src/repositories/**/*.ts,src/domain/**/*.ts,src/schemas/**/*.ts,src/ai/**/*.ts,scripts/**/*.ts"
---

# Backend Instructions

Use these instructions for Comet Academy server functions, repositories, schemas, domain logic, and scripts.

## Layers

- Domain logic belongs in `src/domain/*` and must be pure where possible.
- Zod schemas belong in `src/schemas/*`.
- MongoDB access belongs only in `src/repositories/*`.
- Authenticated workflows belong in `src/server/*`.
- Route-facing server functions belong in `src/server/rpc/*`.
- Scripts may call repositories and server helpers, but must still validate inputs and avoid secrets in output.

## Server Functions

- Use `createServerFn` for route-facing calls.
- Always validate input with `.validator(...)` or a Zod schema.
- Always call `requireAuth()` for authenticated server functions.
- Enforce role and ownership checks server-side, not only in UI.
- Return minimal DTOs that are safe for the browser.
- Do not return secrets, tokens, hashes, raw Stripe secrets, Auth0 secrets, SMTP credentials, or MongoDB connection strings.

## Repository Rules

- One repository module per MongoDB collection.
- Repositories should expose intent-level methods such as `complete`, `undo`, `listForEnrollment`, or `findById`.
- Do not let UI or server service code build ad hoc Mongo queries directly.
- Keep writes idempotent when they affect money, Robux, progress, scoring, or notifications.
- Use stable keys for progress:
  - `enrollmentId`
  - `studentId`
  - `programKey`
  - `subject`
  - `standardCode`
  - `workDate`
  - `itemId`

## Database Environment

- Local, Vercel preview, Docker, and development use `comet-dev`.
- Vercel production uses `comet`.
- Do not hardcode production database names in feature code.
- Do not run destructive data migrations without explicit user approval.
- Data repair scripts must print summaries, not secrets or full student records.

## Scheduling and Progress

- Schedules are enrollment-scoped.
- A day contains ordered tasks.
- Lesson and practice completion are separate persisted records.
- A schedule day is complete only when all non-exam tasks for that day are complete.
- Sick/off days do not break streaks and should stretch the schedule.
- Work-ahead progress must stay attached to the work date/list it belongs to.

## Practice and Scoring

- Practice is lesson-gated.
- Practice answer attempts must be idempotent:
  - no duplicate Robux awards
  - no duplicate penalties
  - no state changes on read-only review
- Single-choice correct answer: selected key equals correct key.
- Multi-select correct answer: selected key set exactly equals correct key set.
- Wrong practice answers deduct the configured practice/wrong penalty only once.
- Written SCR/ECR items are exam-only and require AI/manual scoring.

## OpenAI

- Use the configured OpenAI API client only when `AI_ENABLED=true`.
- Use `gpt-5.4-mini`.
- Keep prompts deterministic and narrowly scoped to scoring.
- On timeout or failure, create or keep manual scoring work instead of blocking the student.
- Do not log full prompts with student PII unless explicitly safe and necessary.

## Auth0

- Auth0 identities must map to existing backend users.
- Gmail/Google login is allowed only for accounts already registered in backend user records.
- Do not allow open signup.
- Keep Auth0 callback/logout URLs environment-driven.

## Stripe and Billing

- Never receive or store raw card data.
- Use Stripe Checkout for real payments.
- Store Stripe references and local subscription state.
- Demo mode is allowed when Stripe keys are placeholders.
- Webhooks must verify signatures before changing billing state.

## Notifications

- Batch practice progress emails at completion, not per question.
- Do not send emails for read-only review or repeated idempotent submissions.
- Notification content should include enough context for parent/admin reports without exposing secrets.
