import { describe, it, expect } from "vitest";
import {
  buildSchedule,
  markDay,
  unmarkDay,
  computeStreak,
  workAhead,
  currentDayIndex,
  completeDay,
  reopenDayForTopic,
  type Schedule,
  type DayPlan,
  type Task,
} from "~/domain/scheduler/scheduler.js";

function topics(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i + 1}`);
}

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

function grade3Schedule(overrides?: Parameters<typeof buildSchedule>[0]["dayStatus"]): Schedule {
  return buildSchedule({
    startDate: "2026-05-02",
    targetDays: 45,
    subjects: ["math", "rla"],
    topicsBySubject: { math: topics("M", 44), rla: topics("R", 10) },
    quotaBySubject: { math: 2, rla: 1 },
    theta: 4,
    dayStatus: overrides,
  });
}

function isExam(day: DayPlan): boolean {
  return day.tasks.some((entry) => entry.kind === "exam");
}

describe("buildSchedule — program-day scheduler", () => {
  it("matches the Grade 3 STAAR baseline worked example", () => {
    const s = grade3Schedule();
    const lessonDays = s.days.filter((day) => day.dayType === "lessons_practice");
    const examDays = s.days.filter(isExam);

    expect(s.days).toHaveLength(45);
    expect(s.days.at(-1)?.date).toBe("2026-06-15");
    expect(lessonDays).toHaveLength(22);
    expect(examDays).toHaveLength(23);
    expect(s.days.filter((day) => day.slot === "EXAM" && isExam(day))).toHaveLength(18);
    expect(s.days.filter((day) => day.slot === "LESSON" || (day.slot === "EXAM" && day.dayType === "lessons_practice"))).toHaveLength(27);

    expect(s.days[0]).toMatchObject({ date: "2026-05-02", slot: "EXAM", dayType: "lessons_practice", remainingAfter: 44 });
    expect(s.days[0]!.lessonRanges).toEqual([
      { subject: "math", from: 1, to: 2, topics: ["M1", "M2"] },
      { subject: "rla", from: 1, to: 1, topics: ["R1"] },
    ]);
    expect(s.days[1]).toMatchObject({ date: "2026-05-03", slot: "EXAM", dayType: "lessons_practice", remainingAfter: 43 });

    const firstExam = examDays[0]!;
    expect(firstExam.date).toBe("2026-05-08");
    expect(firstExam.tasks[0]!.durationMinutes).toBe(180);

    const mathFinish = lessonDays.find((day) => day.lessonRanges?.some((range) => range.subject === "math" && range.to === 44));
    const rlaFinish = lessonDays.find((day) => day.lessonRanges?.some((range) => range.subject === "rla" && range.to === 10));
    expect(mathFinish?.date).toBe("2026-06-04");
    expect(rlaFinish?.date).toBe("2026-05-14");

    const tail = s.days.filter((day) => day.date >= "2026-06-05");
    expect(tail).toHaveLength(11);
    expect(tail.every(isExam)).toBe(true);
    expect(tail.map((day) => [day.date, day.tasks[0]!.durationMinutes])).toEqual([
      ["2026-06-05", 180],
      ["2026-06-06", 180],
      ["2026-06-07", 180],
      ["2026-06-08", 60],
      ["2026-06-09", 60],
      ["2026-06-10", 60],
      ["2026-06-11", 60],
      ["2026-06-12", 180],
      ["2026-06-13", 180],
      ["2026-06-14", 180],
      ["2026-06-15", 60],
    ]);
  });

  it("derives Math=2 and RLA=1 quotas from the baseline lesson window", () => {
    const s = buildSchedule({
      startDate: "2026-05-02",
      targetDays: 45,
      subjects: ["math", "rla"],
      topicsBySubject: { math: topics("M", 44), rla: topics("R", 10) },
    });
    expect(s.config?.quotaBySubject).toMatchObject({ math: 2, rla: 1 });
    expect(s.days[0]!.lessonRanges).toEqual([
      { subject: "math", from: 1, to: 2, topics: ["M1", "M2"] },
      { subject: "rla", from: 1, to: 1, topics: ["R1"] },
    ]);
  });

  it("runs 1-hour weekday exams and 3-hour weekend exams after all topics are taught", () => {
    const s = buildSchedule({
      startDate: "2024-01-01",
      targetDays: 8,
      subjects: ["math"],
      topicsBySubject: { math: ["M1"] },
      quotaBySubject: { math: 1 },
      theta: 1,
    });
    const examDays = s.days.filter(isExam);
    expect(examDays.map((day) => [day.date, day.tasks[0]!.durationMinutes])).toEqual([
      ["2024-01-02", 60],
      ["2024-01-03", 60],
      ["2024-01-04", 60],
      ["2024-01-05", 180],
      ["2024-01-06", 180],
      ["2024-01-07", 180],
      ["2024-01-08", 60],
    ]);
  });
});

describe("markDay / unmarkDay — off/sick date stretch (§10)", () => {
  it("marks a date neutral, stretches the end date, and renumbers later program days", () => {
    const s = grade3Schedule();
    const originalDay42 = s.days.find((day) => day.programDayEnd === 42)!;
    const r = markDay(s, 0, "off");
    expect(r.days[0]!.status).toBe("off");
    expect(r.days[0]!.tasks).toHaveLength(0);
    expect(r.days[0]!.remainingAfter).toBe(45);
    expect(r.days[1]!.status).toBe("scheduled");
    expect(r.days[1]!.lessonRanges?.[0]).toMatchObject({ subject: "math", from: 1, to: 2 });
    expect(r.days).toHaveLength(46);
    expect(r.targetDays).toBe(45);
    expect(r.days.at(-1)?.date).toBe("2026-06-16");
    expect(r.days.find((day) => day.date === originalDay42.date)?.programDayEnd).toBe(41);
  });

  it("removes a flex day and pulls the dates back", () => {
    const s = grade3Schedule();
    const marked = markDay(s, 1, "sick");
    const restored = unmarkDay(marked, 1);
    expect(restored.days).toHaveLength(45);
    expect(restored.targetDays).toBe(45);
    expect(restored.days.at(-1)?.date).toBe("2026-06-15");
    expect(restored.days[1]!.date).toBe("2026-05-03");
    expect(restored.days[1]!.lessonRanges?.[0]).toMatchObject({ subject: "math", from: 3, to: 4 });
  });

  it("applies the documented shortcut for sick/off and accelerated days", () => {
    expect(markDay(grade3Schedule(), 0, "sick").days.at(-1)?.date).toBe("2026-06-16");
    expect(grade3Schedule({ "2026-05-04": { kind: "active", multiplier: 2 } }).days.at(-1)?.date).toBe("2026-06-14");
    expect(grade3Schedule({ "2026-05-04": { kind: "active", multiplier: 3 } }).days.at(-1)?.date).toBe("2026-06-13");
    expect(grade3Schedule({
      "2026-05-04": { kind: "active", multiplier: 3 },
      "2026-05-05": { kind: "sick_off", status: "sick" },
      "2026-05-06": { kind: "sick_off", status: "off" },
    }).days.at(-1)?.date).toBe("2026-06-15");
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

describe("reopenDayForTopic", () => {
  it("reopens a completed day that contains the target lesson topic", () => {
    const s = sched([
      {
        ...day(0, "done", 2),
        tasks: [
          { id: "lesson", kind: "lesson", subject: "math", topic: "3.2A", title: "Math lesson" },
          { id: "practice", kind: "practice", subject: "math", topic: "3.2A", title: "Math practice" },
        ],
      },
      {
        ...day(1, "done", 2),
        tasks: [
          { id: "lesson", kind: "lesson", subject: "math", topic: "3.2D", title: "Math lesson" },
          { id: "practice", kind: "practice", subject: "math", topic: "3.2D", title: "Math practice" },
        ],
      },
    ]);

    const reopened = reopenDayForTopic(s, { subject: "math", topic: "3.2A" });

    expect(reopened.days[0]!.status).toBe("scheduled");
    expect(reopened.days[1]!.status).toBe("done");
    expect(currentDayIndex(reopened)).toBe(0);
  });
});
