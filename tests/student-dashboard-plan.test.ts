import { describe, expect, it } from "vitest";
import { completeDay, currentDayIndex, type DayPlan, type Schedule } from "~/domain/scheduler/scheduler.js";
import {
  planSectionLabel,
  selectDashboardWorkDay,
  workCtaLabel,
  workDateRelation,
  type DashboardTaskCandidate,
} from "~/domain/student/dashboardPlan.js";

function day(index: number, date: string, status: DayPlan["status"]): DayPlan {
  return {
    index,
    date,
    status,
    tasks: [
      { id: `${date}:lesson`, kind: "lesson", subject: "math", topic: `M${index}`, title: "Lesson" },
      { id: `${date}:practice`, kind: "practice", subject: "math", topic: `M${index}`, title: "Practice" },
    ],
    baseCount: 2,
    workloadFactor: status === "scheduled" ? 1 : 0,
  };
}

function schedule(days: DayPlan[]): Schedule {
  return { startDate: days[0]?.date ?? "2026-06-22", targetDays: days.length, days };
}

function tasks(completed: boolean[]): DashboardTaskCandidate[] {
  return completed.map((value) => ({ completed: value }));
}

describe("student dashboard work-date labels", () => {
  it("calls only the actual next calendar date tomorrow", () => {
    expect(workDateRelation("2026-06-22", "2026-06-23")).toBe("today");
    expect(workDateRelation("2026-06-23", "2026-06-23")).toBe("today");
    expect(workDateRelation("2026-06-24", "2026-06-23")).toBe("tomorrow");
    expect(workDateRelation("2026-06-25", "2026-06-23")).toBe("future");
    expect(planSectionLabel("2026-06-23", "2026-06-23")).toBe("Today's plan");
    expect(planSectionLabel("2026-06-24", "2026-06-23")).toBe("Tomorrow's plan");
    expect(workCtaLabel("Start", "2026-06-23", "2026-06-23")).toBe("Start today's work");
    expect(workCtaLabel("Start", "2026-06-24", "2026-06-23")).toBe("Start tomorrow's work");
  });
});

describe("student dashboard cross-midnight rollover", () => {
  it("keeps unfinished carryover work active on the next calendar date", () => {
    const s = schedule([
      day(0, "2026-06-22", "scheduled"),
      day(1, "2026-06-23", "scheduled"),
    ]);
    const selected = selectDashboardWorkDay({
      days: s.days,
      scheduleCurrentDay: currentDayIndex(s),
      calendarDate: "2026-06-23",
      taskViewsByDay: new Map([
        [0, tasks([true, false])],
        [1, tasks([false, false])],
      ]),
    });

    expect(selected.currentDay?.date).toBe("2026-06-22");
    expect(selected.nextWorkDay?.date).toBe("2026-06-22");
  });

  it("moves to the actual current date after yesterday's carryover is completed", () => {
    const before = schedule([
      day(0, "2026-06-22", "scheduled"),
      day(1, "2026-06-23", "scheduled"),
      day(2, "2026-06-24", "scheduled"),
    ]);
    const after = completeDay(before, 0);
    const selected = selectDashboardWorkDay({
      days: after.days,
      scheduleCurrentDay: currentDayIndex(after),
      calendarDate: "2026-06-23",
      taskViewsByDay: new Map([
        [0, tasks([true, true])],
        [1, tasks([false, false])],
        [2, tasks([false, false])],
      ]),
    });

    expect(currentDayIndex(after)).toBe(1);
    expect(selected.currentDay?.date).toBe("2026-06-23");
    expect(selected.nextWorkDay?.date).toBe("2026-06-23");
    expect(planSectionLabel(selected.currentDay?.date, "2026-06-23")).toBe("Today's plan");
    expect(workCtaLabel("Start", selected.currentDay?.date, "2026-06-23")).toBe("Start today's work");
  });

  it("keeps a completed current day visible when the next work is truly tomorrow", () => {
    const before = schedule([
      day(0, "2026-06-23", "scheduled"),
      day(1, "2026-06-24", "scheduled"),
    ]);
    const after = completeDay(before, 0);
    const selected = selectDashboardWorkDay({
      days: after.days,
      scheduleCurrentDay: currentDayIndex(after),
      calendarDate: "2026-06-23",
      taskViewsByDay: new Map([
        [0, tasks([true, true])],
        [1, tasks([false, false])],
      ]),
    });

    expect(selected.currentDay?.date).toBe("2026-06-23");
    expect(selected.nextWorkDay?.date).toBe("2026-06-24");
    expect(planSectionLabel(selected.nextWorkDay?.date, "2026-06-23")).toBe("Tomorrow's plan");
    expect(workCtaLabel("Start", selected.nextWorkDay?.date, "2026-06-23")).toBe("Start tomorrow's work");
  });
});
