# Comet Academy Agent Instructions

This file is the human-readable workflow guide for agents working in this repository. The detailed product specification remains in `INSTRUCTION.md`; this file explains how to safely change the codebase.

## Repository Map

```text
.
├── .github/
│   ├── workflow-instructions.md
│   ├── instructions/
│   │   ├── frontend.instructions.md
│   │   ├── backend.instructions.md
│   │   ├── tests.instructions.md
│   │   └── docs.instructions.md
│   └── prompts/
│       ├── scaffold-project.prompt.md
│       ├── create-api-endpoint.prompt.md
│       ├── create-tanstack-component.prompt.md
│       ├── write-tests.prompt.md
│       ├── refactor-safely.prompt.md
│       └── create-auth0-flow.prompt.md
├── docs/
│   ├── product-spec.md
│   ├── architecture.md
│   ├── api-contract.md
│   └── definition-of-done.md
├── src/
│   ├── routes/
│   ├── server/
│   ├── repositories/
│   ├── domain/
│   ├── schemas/
│   └── styles/
├── scripts/
├── tests/
├── content/
├── electron/
└── README.md
```

## First Steps for Any Task

1. Run `git status --short`.
2. Identify existing user changes and preserve them.
3. Read the nearest relevant code before editing.
4. Keep changes scoped to the user request.
5. Use the existing stack and local patterns.
6. Never read, print, or copy secrets from `.env`.

## Project Stack

- Bun runtime.
- TanStack Start, React, TanStack Router, TypeScript strict, Vite.
- MongoDB via repository modules.
- Zod validation.
- Vitest with V8 coverage.
- OpenAI `gpt-5.4-mini` for written scoring only.
- Auth0 login for existing users.
- Stripe Checkout for payments.
- SMTP for notifications.
- New Relic opt-in observability.
- Docker and optional Electron desktop shell.
- Vercel preview and approval-gated production deployment.

## Architecture Rules

- Pure logic belongs in `src/domain`.
- DB calls belong in `src/repositories`.
- Authenticated server workflows belong in `src/server`.
- Route-facing server functions belong in `src/server/rpc`.
- Pages belong in `src/routes`.
- Shared schemas belong in `src/schemas`.
- Keep MongoDB, Auth0, Stripe, OpenAI, SMTP, and New Relic out of browser bundles.

## Student Workflow Rules

- A lesson unlocks its matching practice.
- Practice completion requires all visible required questions to be answered.
- Correct practice answers award the configured practice-correct Robux value once.
- Wrong practice answers deduct the configured wrong-penalty Robux value once.
- Exam Robux uses the capped exam formula: `min(correctCount * practiceCorrect, examCorrect) - wrongCount * examWrong`, then applies `EXAM_AWARD_FLOOR`.
- The admin label for `examCorrect` is "Exam max reward"; it is a per-attempt positive cap, not a per-question value.
- Repeated submit, refresh, review, History, Dashboard, Wallet, and email/report views must not change Robux again.
- Completed lessons and practices remain visible in dashboard and history.
- History practice opens in read-only review mode.
- History includes completed exams. Opening a completed exam shows read-only question details after submission only.
- Completed exam History rows and Exam Details must calculate Robux from the same formula.
- Dashboard shows completed current work and next scheduled work separately.

## Development Commands

```bash
bun install
bun run dev
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

## Local Run

- Use `bun run dev -- --host 0.0.0.0 --port 5173 --strictPort` when the user wants manual browser testing on port `5173`.
- Local database is `comet-dev`.
- Docker exposes the app on `3000` and `5174`; set `SESSION_COOKIE_SECURE=false` for local HTTP Docker sessions.
- `MONGODB_DATABASE` may override the derived DB name. Do not point local commands at production unless the user explicitly asks.
- Do not modify production data unless the user explicitly requests it.

## Verification Standard

For meaningful feature work, run:

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

Report any existing warnings separately from new failures.

## Documentation Standard

When behavior changes, update relevant docs:

- `README.md` for user-facing setup or deployment.
- `docs/product-spec.md` for product behavior.
- `docs/architecture.md` for structural changes.
- `docs/api-contract.md` for server-function contracts.
- `docs/definition-of-done.md` for completion expectations.

## Final Response Standard

Summarize:

- what changed
- files changed
- checks run
- anything the user must configure manually
