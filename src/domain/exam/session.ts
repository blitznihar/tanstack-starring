/**
 * Exam session state machine (§7) — PURE. Time is computed from timestamps passed
 * in by the caller (never a ticking browser timer), so the server is the single
 * source of truth and the logic is fully testable.
 *
 *   in_progress ⇄ paused
 *   in_progress → on_break → in_progress   (between subject sections)
 *   in_progress → submitted                 (manual or auto on expiry)
 *
 * Pause/break FREEZE the exam clock: active time is banked into
 * `accumulatedActiveMs` and `lastResumeAt` is cleared; the break runs its own
 * separate countdown.
 */

export type ExamSessionStatus = "in_progress" | "paused" | "on_break" | "submitted";

export type ExamSectionMeta = { subject: string; count: number; seconds: number };

export type ExamSessionState = {
  examId: string;
  enrollmentId: string;
  status: ExamSessionStatus;
  durationSeconds: number;
  /** Active exam time banked before the current run (ms). */
  accumulatedActiveMs: number;
  /** Timestamp (ms) the current in_progress run began; null when frozen. */
  lastResumeAt: number | null;
  itemIds: string[];
  sections: ExamSectionMeta[];
  /** Flat start index of each section. */
  sectionBoundaries: number[];
  sectionIndex: number;
  currentItem: number;
  breakSeconds: number;
  /** Timestamp (ms) the current break ends; null when not on break. */
  breakEndsAt: number | null;
  /** Section indices whose preceding break has been served. */
  breaksTaken: number[];
  flagged: string[];
  responses: Record<string, unknown>;
  submittedAt: number | null;
  autoSubmitted: boolean;
};

function boundariesFromSections(sections: ExamSectionMeta[]): number[] {
  const b: number[] = [];
  let acc = 0;
  for (const s of sections) {
    b.push(acc);
    acc += s.count;
  }
  return b;
}

export function sectionOfIndex(state: ExamSessionState, itemIndex: number): number {
  const b = state.sectionBoundaries;
  let section = 0;
  for (let i = 0; i < b.length; i++) {
    if (itemIndex >= b[i]!) section = i;
  }
  return section;
}

export function createSession(input: {
  examId: string;
  enrollmentId: string;
  durationSeconds: number;
  breakSeconds: number;
  sections: ExamSectionMeta[];
  itemIds: string[];
  now: number;
}): ExamSessionState {
  return {
    examId: input.examId,
    enrollmentId: input.enrollmentId,
    status: "in_progress",
    durationSeconds: input.durationSeconds,
    accumulatedActiveMs: 0,
    lastResumeAt: input.now,
    itemIds: input.itemIds,
    sections: input.sections,
    sectionBoundaries: boundariesFromSections(input.sections),
    sectionIndex: 0,
    currentItem: 0,
    breakSeconds: input.breakSeconds,
    breakEndsAt: null,
    breaksTaken: [],
    flagged: [],
    responses: {},
    submittedAt: null,
    autoSubmitted: false,
  };
}

/** Active exam seconds elapsed (excludes paused/break time). */
export function elapsedActiveSeconds(state: ExamSessionState, now: number): number {
  const live = state.status === "in_progress" && state.lastResumeAt != null ? now - state.lastResumeAt : 0;
  return (state.accumulatedActiveMs + Math.max(0, live)) / 1000;
}

/** Display value — ceil so it never shows 0 while time genuinely remains. */
export function remainingSeconds(state: ExamSessionState, now: number): number {
  return Math.max(0, Math.ceil(state.durationSeconds - elapsedActiveSeconds(state, now)));
}

/** Expiry test — uses TRUE elapsed time (not the rounded display value). */
export function isExpired(state: ExamSessionState, now: number): boolean {
  return elapsedActiveSeconds(state, now) >= state.durationSeconds;
}

export function breakRemainingSeconds(state: ExamSessionState, now: number): number {
  if (state.status !== "on_break" || state.breakEndsAt == null) return 0;
  return Math.max(0, Math.round((state.breakEndsAt - now) / 1000));
}

/** Bank the current active run into accumulated time and clear the resume marker. */
function freeze(state: ExamSessionState, now: number): ExamSessionState {
  if (state.status === "in_progress" && state.lastResumeAt != null) {
    return {
      ...state,
      accumulatedActiveMs: state.accumulatedActiveMs + Math.max(0, now - state.lastResumeAt),
      lastResumeAt: null,
    };
  }
  return state;
}

function doSubmit(state: ExamSessionState, now: number, auto: boolean): ExamSessionState {
  const frozen = freeze(state, now);
  return { ...frozen, status: "submitted", submittedAt: now, breakEndsAt: null, autoSubmitted: auto };
}

/**
 * Normalize against the clock. Call this on every read and before every mutation
 * so the session can never accept input past its limits:
 *  - an over-run break (now ≥ breakEndsAt) auto-resumes the next section, resuming
 *    the exam clock from breakEndsAt (the break has a hard limit — §7);
 *  - an expired active timer auto-submits.
 * A paused session has no hard limit, so it stays frozen until the user resumes.
 */
export function settle(state: ExamSessionState, now: number): ExamSessionState {
  if (state.status === "submitted") return state;
  if (state.status === "on_break" && state.breakEndsAt != null && now >= state.breakEndsAt) {
    const nextSection = state.sectionIndex + 1;
    const startIdx = state.sectionBoundaries[nextSection] ?? state.currentItem;
    const resumed: ExamSessionState = {
      ...state,
      status: "in_progress",
      lastResumeAt: state.breakEndsAt, // clock resumes from when the break should have ended
      breakEndsAt: null,
      breaksTaken: [...state.breaksTaken, nextSection],
      sectionIndex: nextSection,
      currentItem: startIdx,
    };
    return settle(resumed, now);
  }
  if (state.status === "in_progress" && isExpired(state, now)) return doSubmit(state, now, true);
  return state;
}

export function answer(state: ExamSessionState, itemId: string, value: unknown, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "in_progress") return s;
  if (!s.itemIds.includes(itemId)) return s;
  return { ...s, responses: { ...s.responses, [itemId]: value } };
}

export function toggleFlag(state: ExamSessionState, itemId: string, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status === "submitted") return s;
  const flagged = s.flagged.includes(itemId) ? s.flagged.filter((x) => x !== itemId) : [...s.flagged, itemId];
  return { ...s, flagged };
}

export function pause(state: ExamSessionState, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "in_progress") return s;
  return { ...freeze(s, now), status: "paused" };
}

export function resume(state: ExamSessionState, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "paused") return s;
  return { ...s, status: "in_progress", lastResumeAt: now };
}

function beginBreak(state: ExamSessionState, now: number): ExamSessionState {
  return { ...freeze(state, now), status: "on_break", breakEndsAt: now + state.breakSeconds * 1000 };
}

/** Move to a specific item (review-grid jump) — never triggers a break. */
export function goto(state: ExamSessionState, index: number, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "in_progress") return s;
  const clamped = Math.max(0, Math.min(s.itemIds.length - 1, index));
  return { ...s, currentItem: clamped, sectionIndex: sectionOfIndex(s, clamped) };
}

/**
 * Advance one item. Crossing into a not-yet-served section opens the break
 * instead of moving (the move happens on endBreak), mirroring the prototype.
 */
export function next(state: ExamSessionState, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "in_progress") return s;
  const nextIdx = s.currentItem + 1;
  if (nextIdx >= s.itemIds.length) return s;
  const nextSection = sectionOfIndex(s, nextIdx);
  if (nextSection > s.sectionIndex && !s.breaksTaken.includes(nextSection) && s.breakSeconds > 0) {
    return beginBreak(s, now);
  }
  return { ...s, currentItem: nextIdx, sectionIndex: nextSection };
}

export function prev(state: ExamSessionState, now: number): ExamSessionState {
  const s = settle(state, now);
  if (s.status !== "in_progress") return s;
  const idx = Math.max(0, s.currentItem - 1);
  return { ...s, currentItem: idx, sectionIndex: sectionOfIndex(s, idx) };
}

export function endBreak(state: ExamSessionState, now: number): ExamSessionState {
  if (state.status !== "on_break") return settle(state, now);
  const nextSection = state.sectionIndex + 1;
  const startIdx = state.sectionBoundaries[nextSection] ?? state.currentItem;
  return {
    ...state,
    status: "in_progress",
    lastResumeAt: now,
    breakEndsAt: null,
    breaksTaken: [...state.breaksTaken, nextSection],
    sectionIndex: nextSection,
    currentItem: startIdx,
  };
}

export function submit(state: ExamSessionState, now: number): ExamSessionState {
  if (state.status === "submitted") return state;
  return doSubmit(state, now, false);
}
