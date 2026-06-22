---
applyTo: "README.md,INSTRUCTION.md,INSTRUCTIONS.md,docs/**/*.md,.github/**/*.md"
---

# Documentation Instructions

Use these instructions when writing or updating project documentation.

## Documentation Tone

- Be direct and implementation-specific.
- Prefer exact commands and exact file paths.
- Avoid vague claims like "secure", "fast", or "robust" unless backed by project details.
- Keep user-facing setup steps practical.

## Secrets and Safety

- Never include real secrets, real API keys, real connection strings, SMTP passwords, Auth0 secrets, Stripe secrets, New Relic license keys, or session secrets.
- Use placeholders such as `sk_test_...`, `whsec_...`, or `<your-value>`.
- Do not copy values from `.env`.
- Explain where secrets belong: GitHub Secrets, Vercel Environment Variables, Auth0, Stripe, MongoDB Atlas, SMTP provider, OpenAI, New Relic.

## Required Project Facts

- Runtime: Bun.
- App framework: TanStack Start with React, TanStack Router, TypeScript, Vite.
- DB: MongoDB through repositories.
- Local/preview DB: `comet-dev`.
- Production DB: `comet`.
- AI: OpenAI `gpt-5.4-mini`.
- Auth: Auth0 for existing users, Google login only for backend-registered Gmail users.
- Billing: Stripe Checkout for real cards, demo mode when not configured.
- Observability: New Relic opt-in.
- Deployment: Vercel with preview and production approval gate, Docker, optional Electron.

## File References

- Use clickable markdown links for local paths when writing final assistant responses.
- In docs, use relative paths such as `src/routes/student.tsx`.
- Keep generated artifacts like `src/routeTree.gen.ts` described as generated, not as hand-authored code.

## Documentation Updates

Update docs when changing:

- environment variables
- deployment workflow
- Auth0 URLs or login rules
- Stripe billing behavior
- database selection
- scheduler semantics
- student practice/lesson flow
- OpenAI model or scoring behavior
- New Relic observability
- commands in `package.json`

## Definition of Done for Docs

- The doc says what changed.
- The doc says how to run or verify it.
- The doc calls out manual setup when required.
- The doc avoids secrets.
- The doc matches current code, not future intent.
