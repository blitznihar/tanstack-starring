---
description: Refactor Comet Academy code without changing behavior.
---

# Refactor Safely

Use this prompt for behavior-preserving cleanup.

## Inputs

- Area to refactor:
- Reason:
- Files in scope:
- Files out of scope:
- Behavior that must not change:

## Instructions

1. Check `git status --short`.
2. Read existing tests and behavior before editing.
3. Keep the refactor narrowly scoped.
4. Do not mix refactor with feature changes unless explicitly requested.
5. Preserve public DTOs, route search params, database shapes, and environment variable names.
6. Preserve idempotency for progress, Robux, billing, and notifications.
7. Avoid moving code across architecture boundaries without a clear benefit.
8. Run tests before and after if practical.

## Required Checks

```bash
bun run lint
bun run typecheck
bun run test:coverage
bun run build
```

## Output

Summarize:

- what moved or simplified
- behavior intentionally unchanged
- tests run
- any follow-up cleanup left out of scope
