---
description: Create a React/TanStack Start route component or shared UI component.
---

# Create a Comet Academy Frontend Component

Use this prompt for route UI, panels, cards, forms, and shared components.

## Inputs

- Component or route name:
- User role:
- Data source:
- Actions:
- Empty/loading/error states:
- Mobile requirements:
- Acceptance criteria:

## Instructions

1. Check `git status --short`.
2. Read nearby route/component files for style conventions.
3. Use existing colors, typography, cards, buttons, and spacing.
4. Use route loaders and server functions for persisted data.
5. Keep state stable across refreshes by persisting progress server-side.
6. Use `Link` and `useNavigate` for navigation.
7. Use typed search params for flows such as lesson/practice:
   - `subject`
   - `standardCode`
   - `workDate`
   - `lesson`
   - `review`
8. Do not add a new UI library.
9. Do not create nested card layouts.
10. Add or update tests if the component introduces logic beyond rendering.
11. Run `bun run typecheck` and `bun run build`.

## Output

Summarize:

- UI added or changed
- route/search params used
- server functions called
- states handled
- checks run
