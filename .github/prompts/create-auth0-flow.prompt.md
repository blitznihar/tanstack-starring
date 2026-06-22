---
description: Modify Auth0 login, callback, logout, or user-mapping behavior.
---

# Modify Auth0 Flow

Use this prompt for login, callback, logout, and backend user mapping changes.

## Inputs

- Auth0 behavior to change:
- Affected environment:
- Required callback/logout URLs:
- User matching rule:
- Roles affected:

## Instructions

1. Do not read or print `.env`.
2. Use `.env.example` only for placeholder names.
3. Keep all real Auth0 secrets in Auth0, GitHub, or Vercel secret stores.
4. Ensure Auth0 users map to existing backend users.
5. Keep Google login restricted to backend-registered Gmail accounts.
6. Do not allow open signup.
7. Update docs if URLs, env names, or login rules change.
8. Test callback, logout, forbidden user, and existing-user login paths.

## Output

Summarize:

- files changed
- Auth0 dashboard settings the user must verify
- checks run
