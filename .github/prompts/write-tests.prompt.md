---
description: Add focused Vitest coverage for Comet Academy behavior.
---

# Write Tests for Comet Academy

Use this prompt when adding tests for a bug fix or feature.

## Inputs

- Behavior under test:
- Files changed:
- Important edge cases:
- Existing related tests:

## Instructions

1. Check existing tests in `tests/`.
2. Prefer pure domain tests when behavior lives in `src/domain`.
3. For server behavior, isolate repository or integration boundaries where practical.
4. Avoid live network and real external services.
5. Use fixed dates for scheduler, rewards, and deadline logic.
6. Cover both success and failure cases.
7. Include idempotency tests for Robux, answer submission, payment, and progress writes.
8. Keep assertions behavior-oriented, not implementation-fragile.

## Commands

```bash
bun test tests/<target>.test.ts
bun run test:coverage
bun run typecheck
```

## Output

Summarize:

- tests added
- edge cases covered
- coverage impact if relevant
- remaining risk
