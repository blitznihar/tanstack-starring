---
applyTo: "src/routes/**/*.tsx,src/components/**/*.tsx,src/app/**/*.tsx,src/styles/**/*.css"
---

# Frontend Instructions

Use these instructions for Comet Academy React and TanStack Start UI work.

## Stack

- React 18.
- TanStack Start and TanStack Router file routes.
- TypeScript strict.
- Inline route-local styles are common in this codebase.
- Global tokens live in `src/styles/global.css`.

## Route Patterns

- Define routes with `createFileRoute`.
- Use route `loader` and server functions for data fetching.
- Use `validateSearch` for query params.
- Use `useNavigate`, `Link`, and typed route params/search instead of manually mutating `window.location`.
- Do not hand-edit `src/routeTree.gen.ts`; run `bun run build` after adding routes.
- Keep route search keys stable for learning flows:
  - `subject`
  - `standardCode`
  - `workDate`
  - `lesson`
  - `review`
  - `studentId`
  - `examSessionId`

## UI Experience Rules

- Student dashboard must always make the current learning state obvious:
  - today completed work
  - next incomplete item
  - tomorrow or next work-day preview
  - history access
- Completed lesson/practice cards should be clickable when safe.
- Practice review and completed-exam detail panels must be read-only.
- Avoid hidden state that resets on refresh, logout/login, route change, or returning later.
- Keep primary workflows direct. Do not add marketing-style landing pages inside app surfaces.
- Use existing colors, typography, spacing, and rounded-card style before adding new visual language.
- Avoid nested cards inside cards.
- Ensure text fits in cards and buttons at mobile and desktop widths.

## Student Flow Rules

- `Start today's work` launches the next incomplete task for the current displayed day.
- `Continue today's work` appears after at least one item is complete but not all are complete.
- `Start tomorrow's work` appears after today's displayed work is complete and next scheduled work has not started.
- `Continue tomorrow's work` appears if next work-day progress already exists.
- Lessons auto-route to matching practice after completion.
- Practice completion returns to `/student`.
- Completed practice review links should include `review=1`.
- History groups completed lessons, practices, and submitted exams by program/date.
- Completed exam rows link back to `/history?examSessionId=...` and render the full Exam Details panel for submitted attempts.
- Student History may show only the current student; parent/admin History uses `studentId` selection and must rely on server-side visibility.
- Exam Review All uses a bounded, scrollable modal/grid so large exams remain usable on desktop and mobile.

## Forms and Controls

- Prefer buttons for actions and links for navigation.
- Disable buttons only when the action is truly unavailable.
- For numeric admin controls, support both direct numeric input and steppers when the existing UI uses steppers.
- Validate client input for helpful feedback, but rely on server validation for enforcement.

## Styling

- Prefer existing CSS variables from `src/styles/global.css`.
- Keep cards at modest radius and consistent padding.
- Do not introduce a new design system or UI library without explicit approval.
- Keep UI copy concise and user-facing.
- Avoid visible instructional text that explains obvious controls.

## Accessibility

- Buttons must be keyboard reachable.
- Do not rely on color alone for status.
- Use clear labels for status such as `COMPLETED`, `PENDING`, `Done`, and `Needs work`.
- Preserve focus and navigation expectations when adding modals or confirmations.
