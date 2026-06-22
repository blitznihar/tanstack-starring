---
description: Scaffold or extend a Comet Academy feature area using the existing stack.
---

# Scaffold a Comet Academy Feature

Use this prompt when adding a new feature area or expanding an existing one.

## Inputs

- Feature name:
- User role(s): student, parent, admin, super_admin
- Data model changes:
- Routes or screens:
- Server functions:
- External integrations:
- Acceptance criteria:

## Instructions

1. Inspect the current working tree with `git status --short`.
2. Read the relevant existing files before proposing changes.
3. Keep the current architecture:
   - TanStack Start routes in `src/routes`
   - server functions in `src/server/rpc`
   - service logic in `src/server`
   - repositories in `src/repositories`
   - pure logic in `src/domain`
   - Zod schemas in `src/schemas`
4. Add or update schemas before writing persistence code.
5. Add repository methods instead of direct MongoDB access.
6. Add server-side auth, role, and ownership checks.
7. Add route loaders and UI that use server functions.
8. Add tests for domain logic and critical server behavior.
9. Run:

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

## Output

Summarize:

- changed files
- new routes
- new server functions
- new data model fields or collections
- tests added or updated
- manual setup required
