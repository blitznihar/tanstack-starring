# Claude Design brief — STAAR Practice Platform (clickable prototype, dummy data)

Paste this into Claude Design. Goal: a **navigable, good-looking UI prototype** that I can click through to feel every key screen **before** I build the real app. **Everything is hardcoded/dummy** — no backend, no real auth, no real model calls, no persistence, no network, no browser storage. Use in-memory React state only.

---

## What this app is (one paragraph for context)

A single-family tutoring app that teaches Grade 3 Texas STAAR concepts (Math + Reading/Language Arts) and delivers redesigned-STAAR-style practice tests, with a kid-friendly reward currency labeled "Robux." Four roles: Super Admin, Admin, Parent, Student. The centerpiece is an **exam player that closely mimics the real online STAAR tester**.

---

## Two design worlds (make them visually distinct)

1. **Student world** — warm, friendly, encouraging, age-appropriate for an 8–9 year old. Rounded shapes, generous spacing, large tap targets, a soft but lively palette, a visible streak and Robux balance, lots of positive (never grade-shaming) language. Clear and uncluttered.
2. **Admin / Parent world** — clean, professional, data-dense. Tables, filters, a TEKS mastery heatmap, charts. Calm neutral palette with one accent color. Information-first.

Aim for an intentional, non-templated look (deliberate type scale, a real accent color, consistent spacing) rather than default component-library styling. Light mode is fine for the prototype.

---

## The Exam Player (the most important screen — make it faithful to STAAR)

Replicate the redesigned STAAR online tester, slightly cleaned up:

- **Top toolbar** with these tools (can be visual/non-functional where noted): **highlighter** (select text -> highlight), **line reader**, **masking** box, **notepad** (floating, draggable), **answer eliminator** (strikethrough a choice), **zoom**, and a **flag for review** toggle. **No calculator** (this is Grade 3 Math).
- **Timer** top-right counting down, with a **Pause** button that freezes it and shows a "Paused" overlay + Resume.
- **RLA items:** **two-pane** layout — a reading passage with **numbered paragraphs** on the left, the question on the right.
- **Math items:** single column, question with a rendered **figure** (e.g., an SVG number line, an array/area model, or a fraction bar — draw a real one, not a placeholder box).
- Include at least one of each item type so I can see them rendered: **multiple choice (A–D)**, **multiselect ("select the TWO")**, **inline choice (dropdown inside a sentence)**, **drag-and-drop (order or sort)**, **number line (place a point)**, **hot text (click a sentence)**, and a **multipart Part A / Part B** (Part B asks which sentence supports Part A).
- **Bottom bar:** Previous / Next, item number (e.g., "7 of 12"), and a **Review** button that opens a grid of all items showing answered / unanswered / flagged, then **Submit**.

---

## Screen inventory (build all, with dummy data)

1. **Login / role picker** — pick Super Admin, Admin, Parent, or Student (dummy, no password). Routes to that role's home.
2. **Student Home** — today's plan card (lesson + practice + any weekend exam), a streak counter, current **Robux balance**, and a big "Start today's work" CTA.
3. **Lesson view (Part A)** — concept title + TEKS code, kid-friendly vocabulary chips, 2–3 worked examples, a rendered **SVG figure**, and a warm one-line encouragement at the bottom.
4. **Practice / exercise view** — a handful of items of mixed types (reuse the item renderers from the exam player) with a "check" interaction and immediate friendly feedback.
5. **Exam Player** — as specified above.
6. **Post-exam results** — raw score, percent, an **estimated performance level** badge (Did Not Meet / Approaches / Meets / Masters, clearly labeled "estimate"), a **per-TEKS breakdown** (mastered / needs work), a "Here's the correct way" expander for each missed item (show the worked solution), and **Robux earned** this exam.
7. **Robux wallet (student)** — **available balance** and **lifetime earned** shown separately, an earn history list, and a **Redeem** button that creates a pending request; show request states (requested / approved / fulfilled).
8. **Topics (student)** — two columns: **completed** vs **remaining**, as a list of TEKS topics with friendly names.
9. **Parent Dashboard** — a **day / week / month** toggle; a **TEKS mastery heatmap**; an exams-over-time chart; an activity log; a Robux history panel; and a topics done/remaining summary.
10. **Admin Console** — tabbed:
    - **Users:** a table + a "Create user" modal that, on submit, shows a **generated password once** (dummy string) with a copy button.
    - **Content:** a list of content bundles (Grade 3 Math, Grade 3 RLA) with **enable/disable** toggles and an **Import bundle** button (file picker UI only).
    - **Scoring review:** an essay (ECR) with the **model's suggested score** (e.g., 3/5), its justification, and **Confirm / Adjust** controls (adjusting changes the displayed score).
    - **Redemptions:** pending requests with **Approve** and **Mark fulfilled** (support a partial-amount input); marking fulfilled visibly **reduces the student's available balance** while lifetime-earned stays the same.
    - **Profiles:** **Export** and **Import** student-profile buttons (Import shows a confirm dialog: "Imported copy is newer — overwrite?").
11. **Scheduler (admin)** — a ~45-day plan as a calendar/list with **Fri/Sat/Sun marked as exam days**.

---

## Dummy data to seed

- Student: **"Maya", Grade 3**, 12-day streak.
- A week of activities (lessons + practice) with mixed scores.
- One sample **Math exam** (~10 items including at least 2 with figures) and one sample **RLA passage** (original text — do NOT use real STAAR passages) with ~8 items.
- **Mastery states** across ~10 TEKS codes: a realistic mix of mastered / needs-work.
- A **Robux ledger**: earned ~1000/week, a couple redeemed, one fulfilled (so available < lifetime earned).
- One sample **ECR essay** with a model score of **3/5**, justification, and a tip.
- Performance-level result example landing at **"Approaches"**.

---

## Interactions to simulate (no backend)

- Navigate between all screens via the role picker and in-app links.
- Exam timer counts down; **Pause/Resume** works; **flag** and **Review grid** work; selecting answers updates state; **Submit -> results**.
- Student **Redeem -> pending**; admin **Approve -> Mark fulfilled (partial allowed) -> available balance drops**.
- Admin **adjust score** changes the displayed final score.
- All data is in-memory; refreshing may reset it — that's fine.

---

## Explicit constraints

- Hardcode all data; **no** real scoring, **no** model calls, **no** API/network, **no** localStorage/sessionStorage, **no** persistence.
- Use **original** placeholder passages and questions; never reproduce real STAAR or other copyrighted text.
- Label any performance level as an **estimate**.
- Prioritize making the **Exam Player** feel authentic and the two design worlds feel clearly different.
