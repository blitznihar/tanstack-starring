import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  markDay,
  computeStreak,
  workAhead,
  currentDayIndex,
  completeDay,
  type Schedule,
  type DayPlan,
  type Task,
} from "~/domain/scheduler/scheduler.js";

function task(id: string): Task {
  return { id, kind: "practice", title: id };
}
function day(index: number, status: DayPlan["status"], n: number): DayPlan {
  const tasks = Array.from({ length: n }, (_, i) => task(`d${index}t${i}`));
  return { index, date: `2024-01-${String(index + 1).padStart(2, "0")}`, status, tasks, baseCount: n, workloadFactor: status === "scheduled" ? 1 : 0 };
}
function sched(days: DayPlan[]): Schedule {
  return { startDate: days[0]?.date ?? "2024-01-01", targetDays: days.length, days };
}

describe("buildSchedule", () => {
  it("covers every active subject on weekdays and an exam on weekends (§20.3)", () => {
    // 2024-01-01 is a Monday.
    const s = buildSchedule({ startDate: "2024-01-01", targetDays: 7, subjects: ["math", "rla"], topics: ["3.2A", "3.4K"] });
    const monday = s.days[0]!;
    expect(monday.tasks.some((t) => t.subject === "math" && t.kind === "lesson")).toBe(true);
    expect(monday.tasks.some((t) => t.subject === "math" && t.kind === "practice")).toBe(true);
    expect(monday.tasks.some((t) => t.subject === "rla" && t.kind === "lesson")).toBe(true);
    // Saturday (index 5) is an exam day.
    expect(s.days[5]!.tasks[0]!.kind).toBe("exam");
  });
});

describe("markDay — off/sick re-fit (§10)", () => {
  it("redistributes within ≤25% when upcoming days have capacity (no extend)", () => {
    const s = sched([day(0, "scheduled", 4), day(1, "scheduled", 4), day(2, "scheduled", 4), day(3, "scheduled", 4), day(4, "scheduled", 4)]);
    const r = markDay(s, 0, "off"); // 4 tasks to move; each upcoming day absorbs 1 (25% of 4)
    expect(r.days[0]!.status).toBe("off");
    expect(r.days[0]!.tasks).toHaveLength(0);
    expect(r.days.length).toBe(5); // NOT extended
    expect(r.targetDays).toBe(5);
    for (let i = 1; i <= 4; i++) {
      expect(r.days[i]!.tasks).toHaveLength(5); // 4 + 1
      expect(r.days[i]!.workloadFactor).toBeCloseTo(1.25);
    }
  });

  it("extends the window only when a ≤25% bump still cannot fit the work", () => {
    const s = sched([day(0, "scheduled", 4), day(1, "scheduled", 4), day(2, "scheduled", 4)]);
    const r = markDay(s, 0, "sick"); // 4 to move; days 1&2 absorb 1 each (2), 2 left → extend
    expect(r.days[0]!.status).toBe("sick");
    expect(r.days[1]!.tasks).toHaveLength(5);
    expect(r.days[2]!.tasks).toHaveLength(5);
    expect(r.days.length).toBe(4); // extended by one day
    expect(r.targetDays).toBe(4);
    expect(r.days[3]!.tasks).toHaveLength(2); // the overflow
    expect(r.days[3]!.status).toBe("scheduled");
  });
});

describe("computeStreak — sick/off neutral (§10)", () => {
  it("counts consecutive done days, skipping sick and off without breaking", () => {
    const s = sched([day(0, "done", 4), day(1, "done", 4), day(2, "sick", 4), day(3, "done", 4)]);
    expect(computeStreak(s, 3)).toBe(3); // 3 done, sick skipped
  });
  it("treats off the same as sick (neutral)", () => {
    const s = sched([day(0, "done", 4), day(1, "off", 4), day(2, "done", 4)]);
    expect(computeStreak(s, 2)).toBe(2);
  });
  it("a missed scheduled day breaks the streak", () => {
    const s = sched([day(0, "done", 4), day(1, "scheduled", 4), day(2, "done", 4)]);
    expect(computeStreak(s, 2)).toBe(1); // index1 missed → breaks
  });
});

describe("work-ahead (§10)", () => {
  it("completes the next N scheduled days and advances the current day", () => {
    const s = sched([day(0, "scheduled", 4), day(1, "scheduled", 4), day(2, "scheduled", 4)]);
    expect(currentDayIndex(s)).toBe(0);
    const { schedule, advanced } = workAhead(s, 2);
    expect(advanced).toBe(2);
    expect(schedule.days[0]!.status).toBe("done");
    expect(schedule.days[1]!.status).toBe("done");
    expect(currentDayIndex(schedule)).toBe(2); // advanced past the done days
  });
  it("caps at the number of available scheduled days", () => {
    const s = sched([day(0, "scheduled", 4), day(1, "done", 4)]);
    const { advanced } = workAhead(s, 5);
    expect(advanced).toBe(1);
  });
});

describe("completeDay", () => {
  it("marks a scheduled day done", () => {
    const s = sched([day(0, "scheduled", 4)]);
    expect(completeDay(s, 0).days[0]!.status).toBe("done");
  });
});
