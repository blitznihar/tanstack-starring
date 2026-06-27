# Comet Academy Product Specification

## Purpose

Comet Academy is a multi-program learning platform for students, parents, admins, and super admins. It teaches lessons, assigns practice, runs exams, tracks progress, awards Robux, supports rewards/redemptions, and provides reporting across programs such as Grade 3 STAAR.

## Primary Roles

### Student

Students can:

- view enrolled programs
- see today's ordered work
- complete lessons
- complete practice
- take exams
- earn or lose Robux based on configured rules
- review completed lessons, past practice answers, and submitted exam details
- see history and progress
- continue tomorrow's work after finishing today's work

### Parent

Parents can:

- view student progress
- view rewards and redemptions
- manage or complete payments when billing is enabled
- receive progress notifications

### Admin

Admins can:

- manage content
- review scoring
- view reports
- manage program operations within allowed associations

### Super Admin

Super admins can:

- manage users and programs
- create users with passwords
- configure billing and reward rules
- configure Robux earning rules
- mark a specific lesson undone for a specific student
- view lessons in student mode
- manage profile import/export

## Learning Model

- A program has one or more subjects.
- Subjects contain standards or topics.
- A student is enrolled in a program through an enrollment.
- Schedules are enrollment-scoped.
- A schedule day contains ordered tasks.
- Lesson and practice are separate student-facing tasks but tied to the same topic.
- Exams are scheduled according to program rules.

## Lesson Rules

- Lessons are student-facing content for a subject and standard.
- Every lesson must support `View PDF`.
- PDF output should faithfully represent the student-facing lesson view.
- Completed lessons remain clickable in dashboard/history.
- Completing a lesson unlocks and routes to matching practice when that is next.

## Practice Rules

- Practice requires the matching lesson to be complete.
- Practice shows at least 20 questions for the focus topic when enough or reusable source questions exist.
- Practice may include review questions from previously completed lessons.
- Students must answer/check all required visible questions before `Complete Practice` is enabled.
- Completion persists progress and returns the student to the dashboard.
- Practice review is read-only and shows previous selected answers and feedback.
- Email notifications are sent after practice completion, not after each question.

## Answer and Robux Rules

- Correct practice answer:
  - show correct feedback
  - add configured `practiceCorrect` Robux once
  - mark answer correct
- Wrong practice answer:
  - show wrong feedback
  - deduct configured `examWrong` Robux once
  - mark answer wrong
- Exam Robux:
  - raw correct reward = `correctCount * practiceCorrect`
  - capped correct reward = `min(raw correct reward, examCorrect)`
  - wrong penalties = `wrongCount * examWrong`
  - final Robux = `capped correct reward - wrong penalties`, floored by `EXAM_AWARD_FLOOR`
  - `examCorrect` is labeled "Exam max reward" in admin UI
- Repeated submit, browser refresh, route changes, History, Dashboard, Wallet, email/report generation, and review mode must not duplicate Robux changes.
- Single-choice answers require exact key equality.
- Multi-select answers require exact set equality.

## Dashboard Rules

The dashboard must compute:

- total items for the displayed work day
- completed items
- pending items
- next incomplete item
- whether the displayed work day is complete
- whether next work-day progress has already started

Dashboard display:

- show today's completed work when the student has finished it
- show `Finished today` with clickable rows
- show tomorrow or next work-day plan as pending when today's work is finished
- show `Start today's work`, `Continue today's work`, `Start tomorrow's work`, or `Continue tomorrow's work` based on progress
- do not reset work-ahead progress when the calendar date changes

## History Rules

- Students can access a History tab.
- History groups completed lessons, practice, and submitted exams by program day/date.
- Completed lessons are clickable.
- Completed practices are clickable and open read-only review.
- Past practice review shows what the student selected and the feedback/correct answer state.
- Submitted exams are clickable and open read-only Exam Details.
- Exam Details show solved count, right/wrong, score, raw correct reward, wrong penalties, cap adjustment, final Robux, question text, student answer, correct answer, result, Robux impact, and explanation when available.
- Student, linked parent, authorized admin, and super admin can view permitted completed exam details. Unassociated users cannot.
- Exam details are visible only after submission/finalization.

## Scheduler Rules

- Program schedules are program-day based.
- Sick/off days stretch the calendar and do not affect streaks.
- Unmarking sick/off should adjust dates back.
- Acceleration compresses the calendar.
- Exams are restricted to configured exam days and topic completion thresholds.
- For one-hour-or-longer exams, item counts must respect the duration/subject minimums in `src/domain/exam/itemCount.ts`: Math uses 90 seconds per question with a 45-question 60-minute floor, and English/RLA uses 216 seconds per question.
- Completed days stay visible in history and dashboard summaries.

## Reward Rules

Reward rules may be based on:

- streak
- points
- complete in days

Rules can be associated with one or more programs. Streak rules support pause or reset behavior. Sick/off days are excused and do not break streaks.

## Billing Rules

- Demo mode can unlock programs during trial/demo periods.
- Stripe Checkout handles real card payments.
- The server does not receive raw card data.
- Access is gated server-side by demo/subscription status.

## Auth Rules

- Auth0 handles login.
- Existing backend users can log in.
- Google login is allowed only for backend-registered Gmail accounts.
- New public signup is not allowed.
