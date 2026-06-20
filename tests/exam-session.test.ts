import { describe, it, expect } from "vitest";
import {
  createSession,
  answer,
  toggleFlag,
  pause,
  resume,
  next,
  prev,
  goto,
  endBreak,
  submit,
  settle,
  remainingSeconds,
  breakRemainingSeconds,
  sectionOfIndex,
  type ExamSessionState,
} from "~/domain/exam/session.js";

const S = 1000;
function make(now = 0): ExamSessionState {
  return createSession({
    examId: "e1",
    enrollmentId: "enr1",
    durationSeconds: 600, // 10 min
    breakSeconds: 300, // 5 min
    sections: [
      { subject: "math", count: 3, seconds: 300 },
      { subject: "rla", count: 2, seconds: 300 },
    ],
    itemIds: ["m1", "m2", "m3", "r1", "r2"],
    now,
  });
}

describe("createSession", () => {
  it("starts in_progress at item 0 with full time", () => {
    const s = make(0);
    expect(s.status).toBe("in_progress");
    expect(remainingSeconds(s, 0)).toBe(600);
    expect(s.sectionBoundaries).toEqual([0, 3]);
  });
});

describe("timer", () => {
  it("counts down active time", () => {
    const s = make(0);
    expect(remainingSeconds(s, 30 * S)).toBe(570);
  });
  it("auto-submits on expiry and rejects further answers", () => {
    const s = make(0);
    const expired = settle(s, 601 * S);
    expect(expired.status).toBe("submitted");
    expect(expired.autoSubmitted).toBe(true);
    const after = answer(expired, "m1", "A", 602 * S);
    expect(after.responses.m1).toBeUndefined();
  });
});

describe("pause/resume freezes the clock", () => {
  it("does not consume time while paused", () => {
    let s = make(0);
    s = answer(s, "m1", "A", 10 * S); // 10s elapsed
    s = pause(s, 10 * S);
    expect(s.status).toBe("paused");
    // 1000s pass while paused
    expect(remainingSeconds(s, 1010 * S)).toBe(590);
    s = resume(s, 1010 * S);
    expect(s.status).toBe("in_progress");
    // 5 more active seconds
    expect(remainingSeconds(s, 1015 * S)).toBe(585);
  });
});

describe("section break", () => {
  it("Next at the last math item opens the break (not advance), freezing the clock", () => {
    let s = make(0);
    s = goto(s, 2, 5 * S); // last math item (m3)
    s = next(s, 20 * S); // crossing into RLA
    expect(s.status).toBe("on_break");
    expect(s.currentItem).toBe(2); // not moved yet
    expect(breakRemainingSeconds(s, 20 * S)).toBe(300);
    // exam clock frozen during break: 20s active used so far
    expect(remainingSeconds(s, 200 * S)).toBe(580);
  });
  it("an over-run break auto-resumes and the exam can then auto-submit (#2)", () => {
    let s = make(0);
    s = goto(s, 2, 5 * S);
    s = next(s, 20 * S); // on_break; 20s active banked; breakEndsAt = 320s
    // Student vanishes; settle long after the break should have ended AND the
    // exam time would have run out (20s used + 600s budget → expiry ~620s after resume@320s).
    const settled = settle(s, 1000 * S);
    expect(settled.status).toBe("submitted");
    expect(settled.autoSubmitted).toBe(true);
  });
  it("a break that ends with time left auto-resumes into the next section (#2)", () => {
    let s = make(0);
    s = goto(s, 2, 5 * S);
    s = next(s, 20 * S); // breakEndsAt = 320s
    const settled = settle(s, 330 * S); // just after the break, plenty of exam time left
    expect(settled.status).toBe("in_progress");
    expect(settled.currentItem).toBe(3);
    expect(settled.sectionIndex).toBe(1);
  });
  it("does not auto-submit a paused session (no hard limit)", () => {
    let s = make(0);
    s = pause(s, 10 * S);
    expect(settle(s, 100000 * S).status).toBe("paused");
  });
  it("accepts an answer in the final fraction of a second (no early expiry — #1)", () => {
    const s = make(0);
    // 599.6s elapsed → 0.4s really left; must NOT be expired.
    const r = answer(s, "m1", "A", 599_600);
    expect(r.status).toBe("in_progress");
    expect(r.responses.m1).toBe("A");
  });
  it("endBreak resumes into the first RLA item and won't re-break", () => {
    let s = make(0);
    s = goto(s, 2, 5 * S);
    s = next(s, 20 * S); // on_break
    s = endBreak(s, 320 * S);
    expect(s.status).toBe("in_progress");
    expect(s.currentItem).toBe(3); // first RLA item
    expect(s.sectionIndex).toBe(1);
    // going next within RLA does not break again
    s = next(s, 330 * S);
    expect(s.status).toBe("in_progress");
    expect(s.currentItem).toBe(4);
  });
});

describe("answer / flag / nav", () => {
  it("autosaves responses and toggles flags", () => {
    let s = make(0);
    s = answer(s, "m1", "B", 1 * S);
    s = toggleFlag(s, "m1", 1 * S);
    expect(s.responses.m1).toBe("B");
    expect(s.flagged).toContain("m1");
    s = toggleFlag(s, "m1", 2 * S);
    expect(s.flagged).not.toContain("m1");
  });
  it("prev clamps at 0; goto jumps without a break", () => {
    let s = make(0);
    s = prev(s, 1 * S);
    expect(s.currentItem).toBe(0);
    s = goto(s, 4, 1 * S); // jump straight to last RLA item, no break
    expect(s.currentItem).toBe(4);
    expect(s.status).toBe("in_progress");
  });
});

describe("sectionOfIndex", () => {
  it("maps item index to section", () => {
    const s = make(0);
    expect(sectionOfIndex(s, 0)).toBe(0);
    expect(sectionOfIndex(s, 2)).toBe(0);
    expect(sectionOfIndex(s, 3)).toBe(1);
    expect(sectionOfIndex(s, 4)).toBe(1);
  });
});

describe("submit", () => {
  it("manual submit freezes and marks submitted (not auto)", () => {
    let s = make(0);
    s = submit(s, 120 * S);
    expect(s.status).toBe("submitted");
    expect(s.autoSubmitted).toBe(false);
    expect(s.submittedAt).toBe(120 * S);
  });
});
