# Comet — Multi-Program Practice Platform

[![CI](https://img.shields.io/github/actions/workflow/status/blitznihar/tanstack-starring/ci-cd.yml?branch=main&label=CI)](https://github.com/blitznihar/tanstack-starring/actions/workflows/ci-cd.yml)
[![CD](https://img.shields.io/github/actions/workflow/status/blitznihar/tanstack-starring/ci-cd.yml?branch=main&event=push&label=CD)](https://github.com/blitznihar/tanstack-starring/actions/workflows/ci-cd.yml)
[![codecov](https://codecov.io/gh/blitznihar/tanstack-starring/graph/badge.svg?token=dGONNkk8Eh)](https://codecov.io/gh/blitznihar/tanstack-starring)
[![Bun](https://img.shields.io/badge/runtime-Bun-black?logo=bun)](https://bun.sh)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![TanStack Start](https://img.shields.io/badge/TanStack%20Start-React-ff4154)](https://tanstack.com/start)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Last commit](https://img.shields.io/github/last-commit/blitznihar/tanstack-starring)](https://github.com/blitznihar/tanstack-starring/commits/main)

A web/desktop app that teaches concepts and delivers exam-style practice across
multiple programs. It is built so
**any program** ( SAT, GRE, "XYZ") can be added by importing
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
| Database | **MongoDB** via the official driver behind a **repository layer** (env-only connection string; DB name is deployment-derived) |
| Validation | **Zod** at every boundary |
| Auth | session cookie (HTTP-only, Secure) + **argon2id** |
| AI (scoring only) | OpenAI Chat Completions (`gpt-5.4-mini`) |
| Billing | **Stripe** (test mode) |
| Desktop | optional **Electron** macOS shell |

Switching local Docker → MongoDB Atlas is a `MONGODB_URI` change only — no code
changes, because all DB access goes through `src/repositories/*`. The URI
chooses the Mongo server/cluster; `MONGODB_DATABASE` can override the database
name locally. Without that override, the app database is `comet-dev` everywhere
except Vercel Production, where it is `comet`.

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
# 162 passing: scoring (+ partial credit), raw→scale→level, ledger
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
> to whatever `MONGODB_URI` points at (default `mongodb://localhost:27017/comet-dev`).
> The local database name is `comet-dev`.
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
  level (SAT), the **Grade 3 Math** bundle's **"View 32
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
bun test                 # run the suite (162 tests)
bun run test:coverage    # run Vitest with V8 coverage, writes coverage/lcov.info
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

### AI scoring (SCR/ECR) — OpenAI

Written responses are scored asynchronously by OpenAI `gpt-5.4-mini`
(the only runtime LLM call, §8). It is **optional**: with no API reachable — or
`AI_ENABLED=false` — written items route to the **manual scoring queue** at `/scoring`,
where a parent/admin sets the final score one click. Submission never blocks on scoring.

```bash
AI_ENABLED=true
OPENAI_API_KEY=sk-...
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-5.4-mini
AI_TIMEOUT_MS=120000
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
  ai/            OpenAI scoring client (M7)
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
| **M7** | RLA & AI scoring & portability — RLA bank (passages + full item-type range), AI scorer (async/override/manual fallback), Math+RLA 50/50 exam + 5-min break, profile export/import (LWW) | ✅ **Done** |
| **M8** | Billing & packaging — plans/subscriptions + super-admin pricing & demo/trial config, parent card payments, **demo mode by default / real Stripe (test) when configured**, program-access gating, docker-compose, optional Electron shell, Atlas-ready | ✅ **Done** |

---

## Deployment

- **Docker/local:** `docker compose up` runs MongoDB locally; the Bun API/UI run
  in Docker Desktop. Optionally package the UI as an Electron macOS app pointing
  at `API_BASE_URL`.
- **Desktop without Docker:** `bun run desktop:prod` builds the app, starts the
  Bun server locally on `http://localhost:3000`, and opens the Electron shell.
  To use an already-running server from another desktop, run
  `bun run desktop -- --url=http://<server-ip-or-host>:<port>` on that desktop.
  See [`electron/README.md`](electron/README.md) for the full same-machine and
  other-desktop flows.
- **Vercel:** TanStack Start is deployed through Nitro. The app uses
  `tanstackStart(), nitro(), viteReact()` in [`vite.config.ts`](vite.config.ts)
  and [`vercel.json`](vercel.json) pins the framework to `tanstack-start`.
  Vercel Git auto-deploys are disabled there because GitHub Actions owns
  preview/production deployment.
- **Atlas:** migrate MongoDB hosting by changing `MONGODB_URI` only. The app
  still uses `comet-dev` outside Vercel Production and `comet` in Vercel
  Production.

### CI

GitHub Actions live in [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml).
The `ci` job runs on pull requests, pushes to `main`, and manual dispatch:

```bash
bun install --frozen-lockfile
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

Coverage uses Vitest's V8 provider and uploads `coverage/lcov.info` to Codecov.
The coverage gate currently measures core unit-tested application logic:
`src/domain/**`, `src/lib/dates.ts`, `src/lib/env.ts`, and auth primitives.
Codecov thresholds are in [`codecov.yml`](codecov.yml): 80% project target with
a 2% threshold, plus an 80% informational patch target.

### CD

Deployments run only after `ci` passes:

- Pull requests from this same repository deploy to the GitHub `preview`
  environment with `vercel pull`, `vercel build`, and `vercel deploy --prebuilt`.
- Pushes to `main` deploy to the GitHub `preview` environment only. Production
  does not run automatically on push.
- After manually validating the preview deployment, promote the same `main`
  branch to production from **Actions -> CI/CD -> Run workflow** with
  `deploy_target=production`. That manual production run executes CI first, then
  targets the GitHub `production` environment with
  `vercel pull --environment=production`, `vercel build --prod`, and
  `vercel deploy --prebuilt --prod`.
- Optionally configure the GitHub `production` environment with required
  reviewers for a second approval gate before the production job can run.
- The deploy jobs set `NITRO_PRESET=vercel` so Nitro writes Vercel Build Output
  API artifacts to `.vercel/output` for `vercel deploy --prebuilt`.
- Fork pull requests do not receive preview deploys, so repository secrets are
  not exposed to untrusted PRs.

Required GitHub Actions secrets:

```bash
VERCEL_TOKEN
VERCEL_ORG_ID
VERCEL_PROJECT_ID
CODECOV_TOKEN
```

Create GitHub environments named `preview` and `production`. To add another
approval layer, open **Settings -> Environments -> production** and enable
**Required reviewers** for the people or teams allowed to approve production
deploys.

### Vercel Setup

Create or link a Vercel project for `blitznihar/tanstack-starring`, then store
runtime values in Vercel Project Settings → Environment Variables. Do not commit
real values to `.env` or `.env.example`.

References: [Vercel TanStack Start guide](https://vercel.com/docs/frameworks/full-stack/tanstack-start),
[TanStack Start hosting guide](https://tanstack.com/start/latest/docs/framework/react/guide/hosting),
and [Vercel GitHub Actions deployment guide](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel).

Server-only secrets must stay unprefixed. TanStack Start/Vite exposes variables
with a `VITE_` prefix to browser code, so do not use `VITE_` for database,
OpenAI, Auth0 client secret, SMTP password, Stripe secret, or New Relic license
values.

Required/expected app environment variables:

```bash
MONGODB_URI                  # Mongo server/cluster URI
MONGODB_DATABASE             # optional DB override; defaults to comet-dev except Vercel production uses comet
SESSION_SECRET
AI_ENABLED
OPENAI_API_KEY
AI_BASE_URL
AI_MODEL
AI_TIMEOUT_MS
AUTH0_DOMAIN
AUTH0_CLIENT_ID
AUTH0_CLIENT_SECRET
AUTH0_CALLBACK_URL
AUTH0_LOGOUT_URL
AUTH0_CONNECTION
API_BASE_URL
EMAIL_FROM
SMTP_HOST
SMTP_PORT
SMTP_SECURE
SMTP_USER
SMTP_PASS
STRIPE_SECRET_KEY
STRIPE_PUBLISHABLE_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_ALLOW_LIVE
NEW_RELIC_ENABLED
NEW_RELIC_APP_NAME
NEW_RELIC_LICENSE_KEY
NEW_RELIC_DISTRIBUTED_TRACING_ENABLED
NEW_RELIC_APPLICATION_LOGGING_ENABLED
NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED
NEW_RELIC_LOG_LEVEL
```

For Auth0, configure callback/logout URLs for every deployed domain, for example:

```text
https://<preview-or-production-domain>/callback
https://<preview-or-production-domain>/logout
```

### Health Check

`GET /health` returns a small JSON payload with status and timestamp. It does
not read MongoDB, call external providers, or expose secrets/database contents.
Use it for Vercel checks, New Relic synthetics, and uptime monitoring.

### New Relic Observability

New Relic is opt-in. Local development remains unchanged with:

```bash
NEW_RELIC_ENABLED=false
```

When enabling direct New Relic Node APM in a Node runtime, set the variables in
Vercel/New Relic secret stores, not in git:

```bash
NEW_RELIC_ENABLED=true
NEW_RELIC_APP_NAME=comet-academy
NEW_RELIC_LICENSE_KEY=<secret>
NEW_RELIC_DISTRIBUTED_TRACING_ENABLED=true
NEW_RELIC_APPLICATION_LOGGING_ENABLED=true
NEW_RELIC_APPLICATION_LOGGING_FORWARDING_ENABLED=true
NEW_RELIC_LOG_LEVEL=info
```

Because this app is ESM and Vercel runs the Nitro output as serverless Node
functions, validate direct Node-agent APM in Preview before enabling it in
Production. New Relic's ESM agent path requires process startup preloading, so
the Vercel setting to test is:

```bash
NODE_OPTIONS=--import newrelic/esm-loader.mjs -r newrelic
```

If direct APM is unreliable on Vercel serverless, use the official Vercel/New
Relic integration for Vercel logs and function traces, plus New Relic synthetics.
The app emits safe custom metrics in Node runtimes where the `newrelic` package
is available at runtime and `NEW_RELIC_ENABLED=true`; on Vercel prebuilt
serverless output, treat those as best-effort until validated in Preview.
References: [New Relic Node.js compatibility](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/getting-started/compatibility-requirements-nodejs-agent/),
[New Relic ESM setup](https://docs.newrelic.com/docs/apm/agents/nodejs-agent/installation-configuration/es-modules/),
and [New Relic for Vercel](https://vercel.com/marketplace/newrelic).

Suggested New Relic dashboard widgets:

- Error rate: transaction error percentage over time, faceted by route/function.
- Response time: average and p95 transaction duration by route/function.
- Throughput: requests per minute by route/function.
- OpenAI scoring failures/timeouts: `Custom/OpenAI/Scoring/Failure`,
  `Custom/OpenAI/Scoring/Timeout`, and `Custom/OpenAI/Scoring/DurationMs`.
- MongoDB latency: `Custom/MongoDB/*/DurationMs`, `Custom/MongoDB/ConnectMs`,
  `Custom/MongoDB/CommandFailure`, and `Custom/MongoDB/ConnectFailure`.
- SMTP failures: `Custom/SMTP/SendFailure` and `Custom/SMTP/SendDurationMs`.
- Auth0 callback failures: `Custom/Auth0/CallbackFailure` and
  `Custom/Auth0/CallbackSuccess`.
- Stripe checkout/webhook failures: `Custom/Stripe/RequestFailure`,
  `Custom/Stripe/WebhookFailure`, `Custom/Stripe/RequestDurationMs`, and
  `Custom/Stripe/WebhookSuccess`.

Suggested synthetic monitors:

- Home page: `GET /`
- Health check: `GET /health`
- Optional safe login smoke test: use dedicated test credentials stored only in
  New Relic secure credentials. Do not commit synthetic usernames, passwords, or
  Auth0 test secrets.

Secrets live in env (see [.env.example](.env.example)); never hardcode them. The
app never stores raw card data — Stripe-hosted/Elements only.
