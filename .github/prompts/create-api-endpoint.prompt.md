---
description: Create or modify a TanStack Start server function and backend flow.
---

# Create a Comet Academy Server Function

Use this prompt for backend work that would traditionally be an API endpoint.

## Inputs

- Function name:
- Caller route or script:
- Required role(s):
- Request data:
- Response data:
- Collections touched:
- Side effects:
- Validation rules:

## Instructions

1. Check `git status --short`.
2. Locate similar server functions in `src/server/rpc`.
3. Define or reuse Zod schemas where the shape is persisted or imported.
4. Add repository methods for MongoDB reads/writes.
5. Implement server logic with `createServerFn`.
6. Validate input with `.validator(...)`.
7. Call `requireAuth()` unless the function is intentionally public.
8. Enforce role and ownership checks server-side.
9. Return a safe DTO for browser usage.
10. Avoid direct use of secrets or environment variables outside config helpers.
11. Add tests for pure logic and meaningful edge cases.

## Checklist

- No raw MongoDB queries outside repositories.
- No secrets in returned data.
- Writes are idempotent where needed.
- Errors are clear and actionable.
- Tests cover success, forbidden access, and invalid input where practical.
- `bun run typecheck` passes.
