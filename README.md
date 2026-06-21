# Comet — Multi-Program Practice Platform

A web/desktop app that teaches concepts and delivers exam-style practice across
multiple programs. It **starts with Grade 3 STAAR (Math + RLA)** but is built so
**any program** (Grade 4/5 STAAR, SAT, GRE, "XYZ") can be added by importing
content — no code changes. See [INSTRUCTION.md](INSTRUCTION.md) for the full spec
and [`Staar/`](Staar/) for the authoritative UI/UX prototype.

> **Build status:** **All milestones M1–M8 are complete and verified** (Foundation,
> Content ops, Practice, Exam delivery, Results/mastery/scheduler, Gamification &
> dashboards, RLA + AI scoring + profile portability, and Billing & packaging).
> See [Milestones](#milestones) below.

---

## Tech stack

| Concern | Choice |
|---|---|
| Runtime | **Bun** |
| Framework | **TanStack Start** (React + Router + Query + server functions), TypeScript **strict** |
| Database | **MongoDB** via the official driver behind a **repository layer** (env-only connection string) |
| Validation | **Zod** at every boundary |
| Auth | session cookie (HTTP-only, Secure) + **argon2id** |
| Local AI (scoring only) | Docker Model Runner (OpenAI-compatible) |
| Billing | **Stripe** (test mode) |
| Desktop | optional **Electron** macOS shell |

Switching local Docker → MongoDB Atlas is a `MONGODB_URI` change only — no code
changes, because all DB access goes through `src/repositories/*`.

---

## Quick start

### Prerequisites
- [Bun](https://bun.sh) ≥ 1.3
- Docker Desktop (for local MongoDB)

### Install
```bash
bun install
cp .env.example .env        # adjust if needed
```

### See it working — three ways

**1. Run the unit tests** (no database needed):
```bash
bun test
# 139 passing: scoring (+ partial credit), raw→scale→level, ledger
# (penalty/floor/partial fulfillment), RBAC, content import, exam assembly,
# mastery/scheduler, AI-score parsing, profile LWW, RLA item-type contracts,
# billing pricing + demo/subscription access gating
```

**2. Run the engine demo** (no database needed) — prints scoring, conversion,
ledger math, RBAC, and Grade 3 Math bundle validation to the terminal:
```bash
bun run demo
```

**3. Run the full data-layer flow against a real MongoDB:**
```bash
docker compose up -d mongo          # local MongoDB on :27017
bun run seed                        # programs + demo users + Maya's enrollments + Grade 3 Math
```
> Already have MongoDB on `:27017`? Skip the compose step — `bun run seed` connects
> to whatever `MONGODB_URI` points at (default `mongodb://localhost:27017/comet`).
`seed` prints **one-time passwords** for the demo accounts
(`superadmin`, `admin`, `parent`, `maya`). After seeding you have:
- 2 programs (`grade3_staar` with subjects `math`,`rla`; `sat` — a separate
  top-level program, **not** nested under Grade 3, per §20.1)
- Maya enrolled in **grade3_staar (45 days)** and **sat (60 days)**, each its own enrollment
- The **Grade 3 Math** bundle: **32 authored items across 8 TEKS pools**, each with
  per-choice rationale, explanation, and worked solution

**4. Run the actual app** (TanStack Start, needs the seeded DB from step 3):
```bash
bun run dev            # → http://localhost:5173
```
Open the URL and pick a role on the login screen (local dev creates a real
session for the seeded demo account — no password needed).

- **Admin / Super Admin** → the live **Content browser**: programs at the top
  level (SAT separate from Grade 3), the **Grade 3 Math** bundle's **"View 32
  items"** with usage counts and answer keys, **pool health** pills
  (ok / running low / exhausted), and the **"Refill prompt"** generator.
- **Student** (Maya) → the **Practice** screen: "Showing 31 questions today · 32
  in the practice bank", pick an answer and **Check** for instant **why-right /
  why-wrong** feedback and a **"+N Robux"** award (idempotent — re-checking never
  re-awards; wrong answers cost nothing in practice). Answered items don't repeat.

All served from MongoDB through TanStack Start server functions.

> The student & parent experiences (daily plan, practice with "+N Robux", exams,
> wallet, dashboards) land in milestones M3–M7, ported 1:1 from the `Staar/`
> prototype per §21.

---

## Useful commands

```bash
bun test                 # run the suite (139 tests)
bun run demo             # no-DB engine demo
bun run build-content    # regenerate content/grade3_{math,rla}.json from authored source
bun run seed             # seed the database (needs Mongo): programs, users, Math + RLA bundles
bun run typecheck        # tsc --noEmit (strict)
bun run lint             # eslint
bun run desktop:dev      # start/use Vite on :5173 and open the Electron shell
bun run desktop:prod     # build, start Bun server on :3000, and open Electron
bun run desktop -- --url=http://<host>:<port>  # open Electron against an existing server

# CLI tools
bun run import-bundle <path.json>                 # single-upload a content bundle
bun run create-user <username> <name> <role,...>  # create a user, prints password once
bun run export-profile [studentId] [outFile]      # export one student's whole profile to JSON (§13)
bun run import-profile <file> [--dry-run]         # import a profile (last-write-wins by exportedAt)
```

### AI scoring (SCR/ECR) — optional local model

Written responses are scored asynchronously by a local **Docker Model Runner** model
(the only runtime LLM call, §8). It is **optional**: with no model reachable — or
`AI_ENABLED=false` — written items route to the **manual scoring queue** at `/scoring`,
where a parent/admin sets the final score one click. Submission never blocks on scoring.

```bash
# point at any OpenAI-compatible endpoint (defaults shown)
AI_ENABLED=true
AI_BASE_URL=http://localhost:12434/engines/v1
AI_MODEL=ai/gemma3
```

### Billing (§12) — demo mode by default, optional Stripe test mode

Visit **`/billing`**. A super_admin defines plans (price steppers, monthly/yearly
where yearly = 2 months free), the **demo/trial** policy (length + which programs
it unlocks), an admin **subscribes**, and a parent can **pay by credit card**.
Program access is gated by subscription **or** active demo.

Out of the box it runs in **demo mode** — payments are recorded as "demo · no real
charge" (matching the prototype). Set a **real Stripe test key** and it switches to
Stripe-hosted **Checkout** automatically:

```bash
STRIPE_SECRET_KEY=sk_test_<your-real-test-key>   # placeholders/"…" → demo mode
# Only sk_test_ keys enable Stripe by default (test-mode guardrail);
# a live key additionally requires STRIPE_ALLOW_LIVE=true.
```

The server **never** receives raw card data (§18): demo card fields are client-only,
and real Stripe collects the card on its hosted page. We store only Stripe
references. **Program access is gated** by subscription/demo — an expired trial with
no subscription blocks practice/exams server-side, not just in the UI.

To complete a *live* subscription, point a **Stripe webhook** (`checkout.session.completed`)
at a route that calls `handleStripeWebhook(rawBody, sig)` with `STRIPE_WEBHOOK_SECRET`;
it verifies the signature and activates the subscription. Demo mode (the default)
needs none of this. An **optional** Electron macOS shell lives in [`electron/`](electron/).

---

## Project layout (§14)

```
src/
  domain/        pure, unit-tested logic — scoring, conversion, ledger, pools
                 (no-repeat + depletion), promptgen (+ mastery, scheduler to come)
  schemas/       Zod schemas: program, enrollment, user, item, contentBundle
  repositories/  one module per Mongo collection (db, users, programs, enrollments,
                 content, itemUsage, sessions)
  server/        server-side services with RBAC — auth, content (import, browser,
                 promptgen), pools, programs (+ more per milestone)
  ai/            DMR scoring client (M7)
  ui/  app/      React components + role-gated routes (M3+)
content/         seeded bundles (grade3_math.json)
scripts/         seed, build-content, demo, import-bundle, create-user
tests/           Vitest suites
electron/        optional macOS shell (M8)
```

---

## Architecture notes

- **Programs & Enrollments are the central abstraction.** Every student-facing
  feature keys off an *enrollment* (student × program), never a bare student.
  Nothing hardcodes "grade 3" or a fixed subject list — code reads program config.
- **Repository layer.** Nothing outside `src/repositories/` imports the Mongo
  driver. `src/lib/env.ts` is the only place that reads `process.env`.
- **Zod at every boundary.** Content import, server-function inputs, and profile
  I/O are all validated. Item answer-keys are fully validated on import.
- **Deterministic scoring** lives in `src/domain/scoring`; SCR/ECR are flagged
  `requiresAsync` and route to the LLM/manual queue (M7) — never auto-scored.
- **Cut points are configurable estimates** stored per program/subject/year,
  never hardcoded percentages.

---

## Milestones

| | Milestone | Status |
|---|---|---|
| **M1** | Foundation & programs — schemas, repos, auth/RBAC, Program/Enrollment, single import, seed Grade 3 Math | ✅ **Done** |
| **M2** | Content ops — browser, item pools (no-repeat + ok/low/exhausted), refill & new-program prompt generators | ✅ **Done** |
| **M3** | Practice — per-concept draw (no-repeat), why-right/why-wrong feedback, instant idempotent "+N Robux" | ✅ **Done** |
| **M4** | Exam delivery — session state machine, STAAR tools, progressive assembly, scoring + negative Robux | ✅ **Done** |
| **M5** | Results, mastery, scheduler — conversion reporting, remediation, off/sick re-fit, streaks, work-ahead | ✅ **Done** |
| **M6** | Gamification & dashboards — ledger, redemptions, reward rules, dashboards | ✅ **Done** |
| **M7** | RLA & AI scoring & portability — RLA bank (passages + full item-type range), DMR scorer (async/override/manual fallback), Math+RLA 50/50 exam + 5-min break, profile export/import (LWW) | ✅ **Done** |
| **M8** | Billing & packaging — plans/subscriptions + super-admin pricing & demo/trial config, parent card payments, **demo mode by default / real Stripe (test) when configured**, program-access gating, docker-compose, optional Electron shell, Atlas-ready | ✅ **Done** |

---

## Deployment

- **Now:** `docker compose up` runs MongoDB locally; the Bun API/UI run in Docker
  Desktop. Optionally package the UI as an Electron macOS app pointing at
  `API_BASE_URL`.
- **Desktop without Docker:** `bun run desktop:prod` builds the app, starts the
  Bun server locally on `http://localhost:3000`, and opens the Electron shell.
  To use an already-running server from another desktop, run
  `bun run desktop -- --url=http://<server-ip-or-host>:<port>` on that desktop.
  See [`electron/README.md`](electron/README.md) for the full same-machine and
  other-desktop flows.
- **Later:** migrate the database to MongoDB Atlas by changing `MONGODB_URI` only.

Secrets live in env (see [.env.example](.env.example)); never hardcode them. The
app never stores raw card data — Stripe-hosted/Elements only.
