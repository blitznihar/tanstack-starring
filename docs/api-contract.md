# Comet Academy API Contract

Comet Academy uses TanStack Start server functions rather than a conventional REST API for most application flows. This document describes the route-facing contracts and safety rules.

## Contract Rules

- Inputs must be validated with `.validator(...)` or Zod.
- Server functions must call `requireAuth()` unless intentionally public.
- Role and ownership checks must happen server-side.
- Responses must be browser-safe DTOs.
- Server functions must not return secrets.
- Mutations that affect money, Robux, progress, scoring, or notifications must be idempotent where possible.

## Public or Semi-Public Routes

### `GET /health`

Purpose: safe health check for uptime monitoring.

Response shape:

```json
{
  "ok": true,
  "service": "comet-academy"
}
```

Rules:

- Do not expose secrets.
- Do not expose database contents.
- Do not expose PII.

## Session and Auth Functions

Location: `src/server/rpc/session.ts`

Responsibilities:

- local/dev login support
- Auth0 callback support
- logout
- password and reset flows where applicable

Rules:

- Auth0 identities must map to existing backend users.
- Google login is allowed only for backend-registered Gmail users.
- Open signup is not allowed.
- Session cookies must remain HTTP-only.

## Student Home

Location: `src/server/rpc/student.ts`

Primary function: `studentHome`

Purpose:

- returns enrolled programs
- returns dashboard summary
- returns displayed work day tasks
- returns finished-today tasks
- returns next work-day tasks
- returns week/exam/reward data

Important response concepts:

- `todayTasks`
- `finishedTodayTasks`
- `nextWorkTasks`
- `nextIncompleteTask`
- `nextWorkIncompleteTask`
- `allTodayCompleted`
- `hasStartedToday`
- `week`

Rules:

- Completed current work must remain visible.
- Next scheduled work is the launch target after current work is done.
- Work-ahead progress must remain attached to the correct work date.

## Student History

Location: `src/server/rpc/student.ts`

Primary function: `studentHistory`

Purpose:

- returns completed lessons, practices, and submitted exams grouped by program day/date
- supports history tab
- provides links back to completed lessons and read-only practice review
- provides completed exam rows with score, final Robux, and `examSessionId`

Rules:

- Student owners can access their own history.
- Linked parents, authorized admins, and super admins can access associated student history by `studentId`.
- Practice review links should include `review=1`.
- Exam rows link with `examSessionId` and open read-only submitted Exam Details.
- History list summaries must use the same exam award formula as Exam Details.
- History loading must not hydrate full question details for every exam row; full details load only for the selected exam.

## Lesson Functions

Location: `src/server/rpc/lesson.ts`

Primary functions:

- `lessonForToday`
- `completeLesson`
- `markStudentLessonUndone`

Rules:

- `lessonForToday` should honor requested `subject` and `standardCode` when the lesson is completed or scheduled for the enrollment.
- `completeLesson` may only complete the actual requested lesson and must reject mismatches.
- Completed lesson pages should allow navigation to matching practice/review without duplicating progress.
- Super admin undo must release completed practice and reusable practice responses for that lesson.

## Practice Functions

Location: `src/server/rpc/practice.ts`

Primary functions:

- `myPracticeSet`
- `submitPractice`
- `completePractice`

Rules:

- Practice requires completed lesson progress.
- Focused practice should use requested `standardCode` when provided.
- `submitPractice` must be idempotent per `enrollmentId` and `itemId`.
- Correct answers award configured Robux once.
- Wrong answers deduct configured Robux once.
- `completePractice` requires all visible item IDs to have responses.
- Practice completion should send one summary notification, not one email per question.
- Read-only practice review must not call mutation functions.

## Exam Functions

Location: `src/server/rpc/exam.ts` and `src/server/exam/*`

Responsibilities:

- create sessions
- assemble exams
- persist responses
- submit exams
- score auto-scorable items
- queue written scoring jobs
- return completed exam details

Rules:

- Written SCR/ECR scoring must not block submission.
- OpenAI failures should route to manual scoring.
- Exam item counts must honor `src/domain/exam/itemCount.ts` minimums for duration and subject split.
- Exam correct-question credit uses `practiceCorrect`.
- `examCorrect` is the exam max reward cap for one completed exam attempt.
- Exam award formula is `min(correctCount * practiceCorrect, examCorrect) - wrongCount * examWrong`, then floored by `EXAM_AWARD_FLOOR`.
- Exam wrong penalties and awards must be ledger-backed.
- Final exam ledger writes happen once per submitted/finalized session, keyed by `source: "exam"` and `refId: examSessionId`.
- `examDetail` returns submitted-only summary and question-level details for the student, linked parent, authorized admin, or super admin.
- `examResult`, `examDetail`, History, Dashboard, Wallet, and notifications are read-only after finalization and must not create ledger entries.

## Admin Console Functions

Location: `src/server/rpc/adminConsole.ts`

Responsibilities:

- users
- programs
- content
- redemptions
- reporting snapshots
- super admin management

Rules:

- Super admin-only operations must enforce `super_admin`.
- Admin-scoped operations must enforce associations/visibility.
- Generated passwords may be shown once and must not be stored in logs.

## Billing Functions

Location: `src/server/rpc/billing.ts` and `src/server/billing/*`

Responsibilities:

- billing config
- plans
- subscriptions
- checkout
- demo/trial access
- webhook handling

Rules:

- Use Stripe Checkout for real cards.
- Never accept raw card data server-side.
- Verify webhook signatures before changing subscription state.
- Demo mode must remain explicit and safe.

## Rewards and Redemptions

Locations:

- `src/server/rpc/rewards.ts`
- `src/server/rewards/*`
- `src/server/gamification/*`

Rules:

- Reward rules can apply to one or more programs.
- Streak rules start on effective date.
- Complete-in-days rules are deadline based.
- Sick/off days are excused.
- Parent/student reward views are read-only.

## Profile Import/Export

Location: `src/server/profile-io/*`

Rules:

- Validate exported/imported data with schemas.
- Use last-write-wins semantics.
- Do not include secrets.
- Support dry-run imports where available.
