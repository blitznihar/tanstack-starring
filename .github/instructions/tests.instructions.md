---
applyTo: "tests/**/*.ts,vitest.config.ts,src/domain/**/*.ts,src/server/**/*.ts,src/repositories/**/*.ts"
---

# Testing Instructions

Use these instructions when adding or changing tests.

## Test Stack

- Test runner: Vitest.
- Coverage provider: V8.
- Main command: `bun run test:coverage`.
- Typecheck command: `bun run typecheck`.
- Lint command: `bun run lint`.
- Build command: `bun run build`.

## Coverage Expectations

- Codecov badge is configured to turn green at 89 percent coverage or higher.
- Preserve or improve coverage when changing domain or server behavior.
- Prefer focused tests for the changed behavior over broad snapshot tests.
- Do not lower thresholds to make failures pass.

## What to Test

- Pure domain logic in `src/domain/*`.
- Scoring:
  - single-choice exact match
  - multi-select exact set match
  - wrong answer behavior
  - partial credit where supported
- Practice:
  - lesson gating
  - idempotent answer submission
  - completion requires all visible questions
  - read-only review does not mutate state
  - correct answers earn configured practice Robux once
  - wrong answers deduct configured wrong-penalty Robux once
- Exams:
  - item-count minimums by duration and subject split
  - correct-question reward uses `practiceCorrect`
  - `examCorrect` is the exam max reward cap
  - wrong-answer penalties and `EXAM_AWARD_FLOOR`
  - duplicate submit/result/history/detail/dashboard reads do not create duplicate ledger entries
  - History row Robux matches Exam Details Robux
  - completed exam details are visible to the student, linked parent, and authorized admin
  - unauthorized users cannot view another student's submitted exam details
  - Review All remains scrollable for large exams on desktop and mobile
- Scheduler:
  - lesson days
  - exam days
  - sick/off day stretch
  - work-ahead compression
  - streak reset/pause/excused semantics for rewards
- Rewards:
  - streak reset
  - streak pause
  - complete-in-days deadline expiry
  - program association
- Auth and billing:
  - role checks
  - ownership checks
  - demo/subscription access gating
- Data import:
  - Zod validation
  - item answer-key contracts
  - RLA passage references

## Test Style

- Keep tests deterministic.
- Avoid relying on wall-clock time without injecting or fixing dates.
- Avoid live network calls to OpenAI, Auth0, Stripe, SMTP, MongoDB Atlas, or New Relic.
- Mock integrations at service boundaries.
- Do not read `.env` in tests except through safe config helpers already used by the project.
- Do not assert on generated route-tree internals unless route generation itself is the subject.

## Running Checks

For small pure logic changes:

```bash
bun test tests/<target>.test.ts
bun run typecheck
```

Before finishing significant changes:

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```
