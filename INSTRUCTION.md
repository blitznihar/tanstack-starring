# INSTRUCTION.md — Multi-Program Practice Platform (codename "Comet")

Coding-agent instructions for **Claude Code**. Read this entire file before generating code. Build in the milestone order in §19. Ask before introducing dependencies or patterns not listed here. A finished Claude Design prototype lives in `./reports/Staar/` and is the **authoritative source of truth for all UI and interaction behavior** — the app must look and behave **exactly** like it. **Before any UI work, read §21.** The screens below map to that prototype.

> **Scope change from v1:** this is no longer a single-family Grade-3-only app. It is a **multi-program** platform that **starts with Grade 3 (Math + RLA)** but supports adding **any program** (Grade 4/5 STAAR, SAT, GRE, "XYZ"). A student can be enrolled in several programs at once, each with its **own schedule, content, exams, scoring, rewards, and streak**. A **billing/subscription** layer is added. Initial deployment is local (Docker Desktop + local MongoDB + optional Electron desktop shell); later migrate the database to MongoDB Atlas.

---

## 0. What you are building

A web/desktop app that teaches concepts and delivers exam-style practice across multiple programs. Pillars:

1. **Content is pre-authored JSON loaded into the app** (no content generation at runtime). When item pools run low/empty, the app **generates a copy-paste authoring prompt**; a human runs it in any LLM offline and re-imports.
2. **The only runtime model call is scoring written responses (SCR/ECR)**, via the configured OpenAI-compatible chat endpoint. Everything else is deterministic.
3. **Everything student-facing is per-enrollment** (student × program): schedule, exams, mastery, rewards, streak, reporting.

Non-goals: realtime/cloud content generation; storing raw card data; coupling any logic to a single grade.

---

## 1. Tech stack (use exactly this)

- **Runtime:** Bun. **Framework:** TanStack Start (React + TanStack Router + TanStack Query + server functions), TypeScript **strict**.
- **DB:** MongoDB via the official `mongodb` driver behind a **repository layer** (one module per collection). Connection string is env-only so **local Docker → Atlas is a config change, not code**.
- **Validation:** **Zod** at every boundary (content import, profile import, all server-function inputs).
- **Auth:** session-based, HTTP-only secure cookie; **argon2id** password hashing.
- **AI scoring only:** OpenAI-compatible Chat Completions, env-configured, currently `gpt-5.4-mini`.
- **Billing:** **Stripe** (Checkout/Payment Intents) for card payments and subscriptions; use **test mode** during development. The app never handles raw PAN data — Stripe-hosted/Elements only.
- **Desktop shell (optional target):** **Electron** packaging the React UI as a macOS app; the UI talks to the Bun API over the home network via an env-configured API base URL. The API + MongoDB run in **Docker Desktop**.
- **Tooling:** Bun scripts; Vitest (or `bun test`); ESLint + Prettier.

Keep dependencies minimal and justified. No other UI frameworks/ORMs/state libs.

---

## 2. Core domain model — Programs & Enrollments (the central abstraction)

- **Program** = a curriculum track. Fields: `key` (e.g. `grade3_staar`, `grade4_staar`, `sat`, `gre`), `title`, `subjects[]` (e.g. Grade 3 → `["math","rla"]`; SAT → `["math","reading_writing"]`), `targetDays` (e.g. 45), `examBlueprint` (subject split + sizing rules), `scoringModel` (conversion tables + rubrics), `status`.
- **Enrollment** = a student in a program. Fields: `studentId`, `programKey`, `startDate`, `targetDays`, `status`, plus all per-student state references (schedule, mastery, ledger, streak). **All student-facing features key off an enrollment, never off a bare student.** One student may hold multiple active enrollments (e.g. Grade 3 in 45 days **and** SAT in 60 days), each with a **separate schedule**.
- **Grade 3 is just the first seeded program.** Nothing in the code may hardcode "grade 3" or two fixed subjects — read program config.

---

## 3. Personas & RBAC

Roles: `super_admin`, `admin`, `parent`, `student`. One account may hold multiple roles. Enforce checks **server-side** in every server function.

| Role | Capabilities |
|---|---|
| `super_admin` | Everything `admin` can do, plus: define **pricing & subscription plans**, configure **demo/trial** (length + which programs, incl. **unlimited**), create/manage all users, generate/reset passwords. |
| `admin` | Import/enable/disable content (single upload); **view & browse item pools**; build/schedule exams; adjust per-concept practice count & time; review/override LLM scores; **configure reward rules**; fulfill Robux redemptions; export/import student profiles; **subscribe & pay**; all reports. |
| `parent` | Read-only oversight (progress by day/week/month, topics done/remaining, reports, activity history, Robux history); **make payments by credit card**. |
| `student` | Do lessons/practice/exams across their enrollments; view own progress + Robux; request redemptions; **work ahead** (do future days today). |

**Reward-rule configuration** is available to **both `admin` and `super_admin`**. **Password generation:** on create, generate a strong password, return it **once** for display, store only the argon2id hash; optional `forceChangeOnFirstLogin`.

---

## 4. Data model (MongoDB collections)

All docs carry `_id`, `createdAt`, `updatedAt`.

- **users** — `{ username, displayName, roles[], passwordHash, forceChangeOnFirstLogin, active }`
- **programs** — see §2
- **enrollments** — see §2 (`studentId`, `programKey`, `startDate`, `targetDays`, `status`)
- **standards** — `{ code, programKey, subject, reportingCategory, description }`
- **bundles** — `{ programKey, subject, version, status, title }` (content is per program+subject)
- **lessons / passages / items** — see §5 (items carry `programKey`, `subject`, `standardCodes[]`, `type`, `difficulty`)
- **itemUsage** — `{ enrollmentId, itemId, usedAt, context: "practice"|"exam" }` (drives **no-repeat** + pool depletion)
- **exams** — assembled definitions `{ enrollmentId, kind: "progressive"|"out_of_cycle"|"mock", sections: [{subject, itemIds[], seconds}], breakSeconds, durationSeconds, splitPct }`
- **examSessions / responses** — live attempts (§7)
- **masteryStates** — `{ enrollmentId, standardCode, state, rollingAccuracy, stuckCount }`
- **robuxLedger** — `{ enrollmentId, type: "earn"|"penalty"|"redeem_fulfilled", amount, source, refId, reason?, createdBy?, metadata?, at }`; `(enrollmentId, source, refId)` is unique when `refId` exists.
- **redemptions** — `{ enrollmentId, amountRequested, amountFulfilled, status, history[] }`
- **rewardRules** — configurable incentives (§11): `{ programKey, studentId?, kind: "complete_in_days"|"streak"|"points", threshold, prize, status }`
- **plans** — `{ name, priceCents, interval, features[], programKeys[] }`
- **subscriptions / payments** — Stripe-linked `{ accountId, planId, stripeCustomerId, stripeSubId, status, demo: {lengthDays, programKeys, unlimited} }`
- **schedules** — per enrollment (§10): `{ enrollmentId, days: DayPlan[] }` where `DayPlan = { date, status: "scheduled"|"off"|"sick"|"done", tasks[], workloadFactor }`

---

## 5. Content: schema, single upload, browser, pools, prompt generation

**Item schema** (core unchanged from v1 — every item is `programKey`+`subject`+TEKS-tagged, `difficulty`-tagged, with `explanation` + `workedSolution`):

```ts
type Difficulty = "easy" | "medium" | "hard";
type Figure = { id; kind: "svg"|"png"; svg?: string; assetId?: string; alt; caption? };
type ItemType =
  | "multiple_choice" | "multiselect" | "multipart" | "inline_choice"
  | "text_entry" | "hot_text" | "hot_spot" | "drag_and_drop" | "number_line"
  | "scr" | "ecr";

type Item = {
  _id; bundleId; programKey; subject;
  standardCodes: string[];          // REQUIRED
  type: ItemType; difficulty: Difficulty;
  passageRef?; prompt: RichContent; figures: Figure[];
  options?; correct?; parts?; blanks?; answer?; zones?; tokens?; draggables?; targets?;
  rubric?: { maxPoints; criteria[] };   // scr/ecr
  points; allowPartialCredit;
  explanation: RichContent;         // WHY the right answer is right / WHY a wrong choice is wrong
  workedSolution: RichContent;      // full step-by-step
};
```

`explanation` must support **per-choice rationale** (why each distractor is wrong) so practice and post-exam feedback can explain both why the right answer is right and why the chosen wrong answer is wrong.

**Single upload (one button).** One import endpoint accepts a full bundle JSON, validates with Zod, **upserts by `(programKey, subject, version)`**, and toggles availability via `status`. No per-item upload controls anywhere. Adding Grade 4/5/SAT/etc. = import a new bundle; removing = set `status:"archived"` (never delete).

**Content browser.** Admin/super_admin can open any bundle and **view every item** (for seeded content, Grade 3 Math has 32 items and Grade 3 RLA has 75 items plus 3 passages), filterable by subject / topic (TEKS) / type / difficulty, with rendered figures and answer keys, and a **usage count** per item.

**Item pools & no-repeat.** A "pool" = items for a given `(programKey, subject, standardCode/topic, type, difficulty)`. Track `itemUsage` per enrollment so **a problem is never shown to the same student more than once**. Per pool, compute unused-item count and a status: **ok / running low / exhausted** (thresholds configurable). Show these prominently in the content browser (the design's "Checks"/Content tab).

**Refill-prompt generator (the design's "Generate refill prompt").** A button compiles **all** low/exhausted pools into a single **copy-paste authoring prompt** that, when pasted into any LLM, produces fresh, correctly-formatted, **non-duplicate** items for every deficit at once. The prompt embeds: the JSON schema, the exact pools needed with counts and status tags, and the instruction not to duplicate existing items (include existing stems/ids to avoid). See **Appendix A** for the exact output format the design uses.

**New-program prompt generator.** A separate "Generate prompt for new program" button produces an authoring prompt to create an **entire new program's** content (subjects, topics, blueprint, item counts) in this schema — used when adding SAT/GRE/XYZ.

---

## 6. Practice mode

- Practice draws a focused set from the available bank and displays the shown count plus total bank count. Current focused practice uses 20 focus questions; Math can add review questions from prior standards, while RLA requires 20 unique focus questions and does not add review.
- After each answer, give **immediate feedback that explains *why* the right answer is right and *why* the chosen answer is wrong** (from the item's per-choice `explanation`), not just the correct letter.
- **Super_admin/admin configure, per concept:** the **number of practice questions** and the **time** allotted. Store on the program/concept config; the practice generator reads it.
- Practice earns or loses Robux immediately per answered item: correct answers add `practiceCorrect`, wrong answers deduct `examWrong`, and repeat checks/reviews do not create additional ledger entries.

---

## 7. Exam engine

A **server-side session state machine** (never a browser timer).

- `examSession = { enrollmentId, examId, startedAt, durationSeconds, remainingSeconds, sectionIndex, onBreak, breakRemaining, state: "in_progress"|"paused"|"on_break"|"submitted", currentItem, flagged[], responses[] }`. **Pause** freezes time; **resume** continues; **autosave** responses; **auto-submit** on expiry. Never send correct answers/explanations for an unsubmitted session.
- **Progressive coverage.** Exams cover **only topics completed so far**: the first exam (after topic 1) covers topic 1; later exams are **cumulative** over all finished topics, weighted toward weak TEKS. The design states this explicitly ("each covers all topics done so far").
- **Multi-subject structure with break.** For Grade 3, each exam is **50% Math + 50% RLA** by **time and item count**, with a **5-minute break** between the Math and RLA sections (the design's "break" screen). Generalize: an exam has ordered **sections** (one per subject) sized by the configured split, with a configurable break between sections.
- **Configurable** (admin, per exam):
  - **Duration presets:** 30, 40, 50, 60, 70, 80, 90, 105, 120, 150, 180 min (configurable set, up to 3 h).
  - **Subject split %:** e.g. 50/50, 70/30, and **pure Math (100/0)** or **pure RLA (0/100)**; generalizes to any program's subjects.
  - **Out-of-cycle exams:** schedule an extra exam outside the normal weekend cadence.
- **Minimum item counts.** For exams at least 60 minutes long, enforce `src/domain/exam/itemCount.ts`:
  - Math: 90 seconds per question, with at least 45 questions for a 60-minute pure Math exam.
  - English/RLA: 216 seconds per question.
  - Examples: 90-minute pure Math = 60 questions; 90-minute pure English/RLA = 25 questions; 180-minute pure Math = 120 questions; 180-minute pure English/RLA = 50 questions.
- **STAAR-faithful player** (matches the design): top toolbar — **Mark** (highlighter), **Reader** (line reader), **Mask**, **Notes**, **Cross** (answer eliminator), **zoom**; **Flag**; **timer**; **Pause**. **No calculator for Grade 3 Math.** Include the Grade 3 **math reference sheet** on mocks. RLA items use a **two-pane** layout (numbered-paragraph passage | question). Render real figures (e.g. SVG number line) inline.

---

## 8. Scoring engine

- **Deterministic** for all selected/structured types, **including partial credit** where `allowPartialCredit`.
- **Raw → scale → performance level** via a **conversion table stored per program/subject/year**; levels **Did Not Meet / Approaches / Meets / Masters** (estimates — cut points change yearly; never hardcode a fixed %).
- **Scores are reported both per-program (per enrollment) and as an overall cross-program rollup** for the parent dashboard. Persist per-enrollment results and aggregate for "overall."
- **SCR/ECR (only runtime LLM call):** enqueue a `scoringJob`; score **asynchronously** (results render immediately for auto-scored items; written items show "scoring…"). Call the configured OpenAI-compatible endpoint with `AI_BASE_URL`, `OPENAI_API_KEY`, and `AI_MODEL` (default `gpt-5.4-mini`), `temperature: 0.2`, system prompt = the exact rubric, and **reply STRICT JSON** `{score, justification, tips}`. Parse defensively. **Parent/admin one-click override** sets the final score. **Graceful fallback:** if OpenAI is unreachable or `AI_ENABLED=false`, route to a **manual scoring queue**. Never block submission on scoring. Call AI **server-side only**.

---

## 9. Mastery & remediation (rule-based, per enrollment)

`masteryState` per enrollment per TEKS (`mastered|partial|not_mastered` + rollingAccuracy + stuckCount), updated after each activity/exam. Effects: spiral weighting toward weak standards; auto-inject weak-TEKS lessons + micro-scaffolds; the exam assembler **selects more items** for weak TEKS; **circuit-breaker** after ~3 consecutive `not_mastered` (switch representation + flag the adult). **Topics completed vs. remaining** = bundle TEKS minus mastered, per enrollment.

---

## 10. Scheduler (per enrollment)

- Compress each program's curriculum into its `targetDays` as ordered units; weekdays = lesson + practice, weekend = progressive exam (§7).
- **Off day / Sick day.** Marking a day **off** or **sick** re-fits the plan: **redistribute that day's work onto upcoming days by increasing their workload up to 25%**; **only if a ≤25% increase still cannot fit** within the window do you **extend the number of days**. (The design: "Mark a day Off or Sick and the plan re-fits itself.")
- **Streaks.** A streak counts consecutive scheduled days completed. **Sick days do NOT count as a streak** (they are neutral — they neither increment nor break it); treat off days the same. Streak is per enrollment.
- **Work ahead.** A student may do **the next day's work today, or several days' work in one day**, for any enrollment; completing future tasks advances the schedule accordingly (the design's "work ahead" screens).
- Each enrollment has its **own independent schedule** (e.g. Grade 3 / 45 days and SAT / 60 days run in parallel).

---

## 11. Gamification — Robux ledger + Reward rules (per enrollment)

Two mechanics:

**A. Robux currency (spendable).** Program `robuxRules` are the source of truth: `practiceCorrect` is the per-question correct reward, `examCorrect` is the **Exam max reward** cap for one completed exam attempt, `examWrong` is the wrong-answer penalty, and `lessonComplete` is the lesson-completion value. Practice answers write signed deltas immediately and idempotently. Exam finalization writes at most one ledger entry per submitted `examSessionId`. Exam award formula: `min(correctCount * practiceCorrect, examCorrect) - wrongCount * examWrong`, then apply `EXAM_AWARD_FLOOR` (default `0`). `availableBalance = lifetimeEarned − penalties − totalFulfilled` (preserve `lifetimeEarned` for reporting). **Redemption flow:** student **requests** → admin **approves** → admin **marks fulfilled** (books a negative entry = the "reset for fulfilled amount"); support **partial fulfillment**. Ledger is **per enrollment**, with an aggregate wallet view.

**B. Reward rules (configurable milestone incentives).** Configurable by **admin and super_admin**, **per program and optionally per student**, e.g.: "Meta Quest if Grade 3 is finished in ≤45 days", "Laptop if GRE finished in ≤60 days", "Chicago trip at a 20- or 30-day streak". A rule has a `kind` (`complete_in_days` | `streak` | `points`), a `threshold`, and a `prize`. The system evaluates rules against enrollment progress/streak and, when met, surfaces the reward for **admin fulfillment**. Sick days excluded from streak counting (§10) apply here too.

---

## 12. Billing & subscriptions

- **super_admin defines** plans (name, price, interval, features, included `programKeys`) and the **demo/trial** policy: **length** (7/14/30/60 days or **unlimited**) and **which programs** the demo unlocks (the design's "Demo / trial period" panel with per-program toggles).
- **admin can subscribe and pay**; **parent can pay by credit card**. Use **Stripe** (Checkout or Payment Intents + Elements) in **test mode** during development; store only Stripe references (`stripeCustomerId`, `stripeSubId`), never card data. Gate program access by subscription/demo status.

---

## 13. Export / import a student profile

Export one student as JSON across all their enrollments: user doc (no hash), enrollments, responses, exam sessions/results, mastery, robux ledger, redemptions, reward-rule progress, schedules, scoring results; top-level `exportedAt` + `schemaVersion`; **content excluded** (reference program/bundle only). Import: whole-profile **last-write-wins by `exportedAt`** (newer replaces, older skipped with a warning), with a confirm/preview before overwrite.

---

## 14. Repository structure

```
src/
  app/        admin/ parent/ student/ exam/ auth/        # role-gated route trees
  server/     auth/ programs/ content/ pools/ exam/ scoring/ mastery/
              scheduler/ gamification/ rewards/ billing/ reporting/ profile-io/
  domain/     scoring/ ledger/ conversion/ mastery/ scheduler/ promptgen/   # pure logic
  repositories/   # one per collection
  schemas/        # Zod: contentBundle, profileExport, server inputs
  ai/             # OpenAI-compatible scoring client + rubric prompts
  ui/             # shared components incl. exam tools (Mark/Reader/Mask/Notes/Cross/zoom)
content/          # seeded bundles: grade3 math + rla
electron/         # optional macOS shell
scripts/          # seed, import-bundle, create-user, export/import-profile
tests/
.env.example
INSTRUCTION.md
```

---

## 15. Environment (.env.example — never hardcode any of these)

```
MONGODB_URI=mongodb://localhost:27017/comet-dev  # swap to Atlas SRV string later
MONGODB_DATABASE=                                # optional DB override; default comet-dev except Vercel production uses comet
SESSION_SECRET=change-me
SESSION_COOKIE_SECURE=false                     # false for local HTTP Docker, true/auto for HTTPS production
AI_ENABLED=true
OPENAI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5.4-mini
AI_TIMEOUT_MS=120000
WEEKLY_ROBUX_BUDGET=1000
EXAM_ROBUX_SHARE=0.5
EXAM_WRONG_PENALTY=10
EXAM_AWARD_FLOOR=0
API_BASE_URL=http://localhost:3000               # Electron UI reads this over the home network
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

---

## 16. Deployment

- **Now:** MongoDB can run in a local Docker container; Bun API + React UI can run in Docker Desktop with the API serving the UI. `docker-compose.yml` exposes the app on `3000` and `5174`, supports `MONGODB_DATABASE`, and uses `SESSION_COOKIE_SECURE=false` for local HTTP unless overridden. Optionally package the UI as an **Electron macOS app** pointing at `API_BASE_URL` on the home network.
- **Later:** migrate the database to **MongoDB Atlas** by changing `MONGODB_URI` only (repository layer means no code changes). Keep all secrets in env / a secret store.

---

## 17. Coding standards & Definition of Done

TS strict; Zod at boundaries; Mongo only via repositories; AI scoring only via `src/ai`; Stripe only via `src/server/billing`; server-side role checks; argon2id; HTTP-only cookies. Pure logic in `src/domain` is unit-tested. **Required tests:** scoring incl. partial credit; raw→scale→level; ledger math incl. practice penalties, exam max cap, floor, and partial fulfillment; **no-repeat** item selection + pool depletion status; **refill-prompt generator** output; scheduler **off/sick re-fit (≤25% then extend)** and **streak excluding sick days**; **work-ahead** advancement; exam-session state machine incl. **section break**; exam item-count minimums; History/Exam Details/email consistency; role permissions for completed exam details; profile-import LWW; one integration test submit → score → mastery update. Surgical changes only.

---

## 18. Behavioral guardrails (for the agent)

- **Never call an LLM at runtime except SCR/ECR scoring.** Pools refill via the **offline** prompt-generation flow.
- **Never hardcode "grade 3" or a fixed subject list** — read program/enrollment config so new programs (Grade 4/5, SAT, GRE, XYZ) work without code changes.
- **Never integrate Roblox**; Robux is internal points, fulfilled manually.
- **Never store raw card data**; use Stripe-hosted/Elements only; test mode in dev.
- **Use original passages only**; never reproduce copyrighted STAAR/other text.
- **Treat cut points as configurable estimates.** Never expose unsubmitted answers/explanations to the client. State assumptions and proceed when ambiguous; ask before adding dependencies.

---

## 19. Milestones (build in this order)

- **M1 — Foundation & programs:** Zod schemas; Mongo repositories; auth/RBAC + user creation/password gen; **Program/Enrollment** model; **single content import**. Seed Grade 3 **Math** and **RLA** bundles.
- **M2 — Content ops:** content **browser** (view every item in a bundle with computed counts), **item pools** (no-repeat usage + ok/low/exhausted), **refill-prompt generator** + **new-program prompt generator**.
- **M3 — Practice:** practice mode with focused/review draws, **why-right/why-wrong** feedback, per-concept count & time config, and signed idempotent Robux.
- **M4 — Exam delivery:** session state machine (presets, pause/resume, autosave, **section break**), STAAR-faithful tools, **progressive** assembly, configurable split + pure + out-of-cycle, deterministic scoring incl. partial credit + **capped/signed Robux**.
- **M5 — Results, mastery, scheduler:** conversion tables + per-program & overall performance reporting; mastery/remediation + circuit-breaker; per-enrollment scheduler with **off/sick re-fit**, **streak (sick excluded)**, **work-ahead**.
- **M6 — Gamification & dashboards:** Robux ledger + redemption flow; **configurable reward rules** (complete-in-days / streak / points, per program/student); admin/parent/student dashboards (day/week/month, topics done/remaining).
- **M7 — RLA & AI scoring & portability:** Grade 3 **RLA** (passages, SCR/ECR) + OpenAI-compatible scorer (async, override, fallback); **Math+RLA 50/50 exam with 5-min break**; profile export/import (LWW).
- **M8 — Billing & packaging:** Stripe plans/subscriptions + demo config + parent card payments; `docker-compose`; optional **Electron** macOS shell; Atlas-ready connection string.

Each milestone ends with run instructions, passing tests, and a short change note.

---

## Appendix A — Refill-prompt output format (what the generator must emit)

The generator concatenates a header + the schema + the deficit list, e.g.:

```
You are an item writer for a Grade 3 Texas STAAR practice platform.
Generate fresh, non-duplicate practice problems for the pools listed below.
These pools are low or exhausted — students would otherwise repeat questions.

OUTPUT FORMAT: a JSON array of Item objects matching this schema: <schema>.
Each item needs: standardCodes, type, difficulty, prompt, figures (inline SVG where a
figure is referenced), full answer key, allowPartialCredit, explanation (with per-choice
rationale), and workedSolution. Do NOT duplicate any existing stem (existing stems: <list>).

POOLS NEEDED:
• Comparing numbers (TEKS 3.2D) — need 8 new items [running low]
• Multiplication & division word problems (TEKS 3.4K) — need 12 new items [POOL EXHAUSTED]
• Number patterns (TEKS 3.5B) — need 8 new items [running low]
```

The author pastes this into any LLM, gets a JSON array back, and re-imports it through the single upload — closing the loop without any runtime LLM call.

---

## 20. Prototype-driven refinements (authoritative — extends earlier sections)

These reflect the latest "Comet" standalone prototype and consolidated feedback. Where they extend an earlier section, follow these.

### 20.1 Content is grouped by Program (not by grade)
- The Super Admin **Content** area lists **Programs** at the top level — e.g. **Grade 3 STAAR** (subjects: Math, Reading/Language Arts, Spanish Math [beta]) and **SAT** (its own program), GRE, etc. **SAT must NOT appear nested under "Grade 3."**
- **Every bundle gets a "View N items"** browser entry (Math, RLA, Spanish Math beta, SAT, …) — not just Grade 3 Math. The count is computed from the bundle.

### 20.2 RLA at parity with Math
- Grade 3 RLA has its **own item bank and passages**, its **own exam minutes/config**, and appears in pickers and the daily plan exactly like Math.
- **Use the full RLA item-type range**, not just single-answer multiple choice:
  - Multiple choice (Select only ONE) → `multiple_choice`
  - **Select TWO (or more)** → `multiselect`
  - **Record your answer in the box** → `text_entry`
  - **Drop-down / inline choice** → `inline_choice`
  - **Multipart Part A / Part B** (evidence) → `multipart`
  - **Hot text** (select a sentence/word) → `hot_text`
  - Written: **SCR (2-pt)** and **ECR (5-pt)**, scored by the local model.
- Seed enough RLA examples (passages + these item types) to "get the feel."

### 20.3 Daily plan must cover every active subject
- The student's day must include, per program, at least **one lesson + practice for EACH active subject** — for Grade 3 that means **Math lesson+practice AND English (RLA) lesson+practice**. Generalize: iterate the program's `subjects[]`. (Extends §10.)

### 20.4 STAAR Math visuals & digital tools
- **Figure data must support** (extends §5 `Figure`): inline `svg`/`png`, bar graph, **pictograph**, **dot plot**, **number line**, geometric shapes / **grids for perimeter & area**, **base-10 blocks**, **fraction strips/bars**, arrays, and area models. The app should render authored figures inline when the item provides SVG/figure data.
- **Exam digital tools (Math), extends §7 toolbar:** include Mark / Reader / Mask / Notes / Cross / zoom. **No calculator for Grade 3 Math.**
- **Hot spot** is a distinct item type (click a point/region on a figure, e.g. a number line); author and score it as `hot_spot` even where the prototype currently approximates it with a number-line tap.

### 20.5 Robux earning rules — Super-Admin configurable, SEPARATE from reward rules
Two distinct, configurable mechanics (extends §11):
- **Robux earning rules** — the per-event point values that drive ALL earning across the app, configurable by super_admin/admin via steppers and treated as the single source of truth:
  - per **correct practice answer** (e.g. 10)
  - **exam max reward** (maximum positive correct-question reward for one completed exam attempt)
  - **wrong-answer penalty** (practice and exam)
  - per **lesson** completed
- **Reward rules** — milestone prizes (Meta Quest / laptop / vacation, by complete-in-days or streak), per program and optionally per student (as in §11.B).
These are two separate config surfaces; do not conflate them.

### 20.6 Robux UX details (extends §6, §11)
- **Practice awards Robux on each correct answer, instantly**, with a "+N Robux" badge; **idempotent** — re-checking the same item must not re-award.
- **Practice deducts Robux on each wrong answer, instantly**, using the configured wrong-answer penalty; **idempotent** — re-checking the same item must not re-deduct.
- **Exam pickers show "Earn up to N Robux"** per test, computed as `min(scorable items × practiceCorrect, examCorrect)`.
- **Exam results and reports show** raw correct reward, capped correct reward, wrong penalties, cap adjustment, and final Robux.
- **Redemption catalog includes a standard "Roblox: 1,000 Robux" option at 1,000 Robux**, alongside the configurable prizes. Redemption still follows request → approve → fulfill → settle (§11.A).
- **The student wallet shows reward rules** — a "Big goals & rewards" panel listing each promised prize with its goal and a **progress bar**, per enrollment.

### 20.7 Answer-format safety
- Any answer-formatting helper (word counters, label/value extractors, etc.) must **coerce non-string answers safely**: a `multiselect` answer is an array and a `multipart` answer is an object — never call string methods like `.trim()` on them unguarded.

---

## 21. UI/UX source of truth — replicate the Claude Design prototype exactly (AUTHORITATIVE)

**Read this before any UI work.** The finished design lives in `./reports/Staar/`. The real app must **look and behave exactly like it** — same screens, layout, component hierarchy, copy/labels, colors, typography, spacing, icons, and interactions. Do **not** redesign, re-theme, swap in a different component library, simplify, or drop screens/labels.

### 21.1 Authoritative files (in `./reports/Staar/`)
- **`STAAR Practice Platform.standalone-src.html`** — readable source of the prototype and the **primary reference implementation to port**. Extract the exact DOM structure, styles, and component logic from here.
- **`STAAR Practice Platform (standalone).html`** — runnable single-file build (open in a browser to see/click the real thing).
- **`support.js`** — supporting JS (state, handlers, scoring/award logic, data shapes). Port its **behavior** faithfully.
- **`screenshots/*.png`** — per-screen **visual reference**; match each screen to its screenshot.
- **`uploads/2023-staar-grade-3-reading-itemsampler.pdf`** — real STAAR Grade-3 Reading item sampler; use as the authenticity reference for RLA item types/wording. **Do not copy its passages — original content only.**
- `STAAR Practice Platform.dc.html` is the Claude Design canvas file (not for porting).

### 21.2 How to port (keep the UI, swap the data)
1. **Extract the design system** from the source HTML: CSS variables / utility classes / tokens (colors, font sizes, radii, spacing, shadows), the two "worlds" (kid-friendly Student vs. data-dense Admin/Parent), and shared components (exam toolbar, cards, modals, steppers, progress bars). Reproduce these as the app's global styles/components so every screen inherits the exact look.
2. **Recreate each screen** as a TanStack React component that matches its screenshot 1:1 (structure, copy, spacing, states).
3. **Replace dummy data with real data only at the data layer.** The prototype holds state in memory; in the app the same components instead read/write via TanStack Query → Bun server functions → MongoDB (and the OpenAI-compatible scorer / Stripe). **The visual and interaction layer must not change — only where the data comes from.**
4. **Preserve every micro-interaction:** exam timer + **Pause**, **break** between sections, **Flag** + **Review** grid, **Cross**/eliminator, **Mark**/highlighter, **Reader**, **Mask**, zoom; practice signed Robux instant feedback; redemption modal incl. **"Roblox: 1,000 Robux"**; **work-ahead**; scheduler **Off/Sick** re-fit; **refill-prompt** modal; **demo/plan** toggles; **robux-rules** steppers.

### 21.3 Screen ↔ screenshot map (build all)
The `01–04` prefixes are states/scroll positions of the same screen — build the full screen.
- **programs** → Student / Super-Admin **Study plan** (program tabs, progressive exams, Off/Sick chips, work-ahead).
- **exam** / **sat-exam** → **Exam Player** (STAAR toolbar, timer, Pause, number-line figure, nav/Review).
- **break** → the **5-minute break** screen between Math and RLA.
- **practice-feedback** → **Practice** (why-right / why-wrong, signed Robux feedback).
- **bank** → **Wallet** (available + lifetime Robux, earn history, **"Big goals & rewards"** panel).
- **pay** → **Subscriptions / payments** (plans + **Demo/trial** length & per-program toggles).
- **checks** → **Content** browser (per-program bundles, **"View N items,"** pool **ok / low / exhausted**).
- **genprompt** → **Refill prompt** modal (copy-paste authoring prompt).
- **robux-rules** → Super-Admin **Robux earning rules** steppers.
- **math-bargraph**, **math-griddable** → STAAR Math renderers (bar graph; griddable number pad).
- **rla-multiselect**, **rla-text**, **rla-essay** → RLA renderers (Select TWO; record-in-box; ECR essay).
- **workahead** / **wa2** → **work-ahead** flow. **v2 / v3 / v4** → additional console/dashboard states.
- **standalone-check** → reference render of the standalone build.

### 21.4 Precedence
- For **look and interaction behavior**, the prototype in `./reports/Staar/` **wins** over any prose elsewhere in this document.
- For **backend, data model, scoring math, no-repeat, security, and architecture**, §1–§20 still govern. Where a prototype shortcut conflicts with a backend rule (e.g. the prototype fakes scoring), keep the prototype's **UI/UX** but implement the **real backend rule** behind it.

### 21.5 UI Definition of Done
A screen is done when: it matches its screenshot (layout, copy, colors, type, spacing); every interaction from the prototype works identically; it is wired to real data via the server layer (no remaining dummy state); and it renders correctly in the Electron macOS shell. Visually diff against `reports/Staar/screenshots/` before marking it complete.
