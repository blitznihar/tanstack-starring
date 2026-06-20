/**
 * Per-enrollment scheduler (§10) — PURE.
 *
 * - Curriculum compressed into `targetDays`: weekdays = lesson + practice for
 *   EACH active subject (§20.3), weekends = a progressive exam.
 * - Off/Sick re-fit: a missed day's work is redistributed onto upcoming days by
 *   raising their workload UP TO 25%; only if a ≤25% bump still can't fit do we
 *   EXTEND the window with new days.
 * - Streaks: consecutive completed scheduled days. Sick AND off days are neutral
 *   — they neither increment nor break the streak.
 * - Work-ahead: complete future days today; the schedule advances.
 */

export type DayStatus = "scheduled" | "off" | "sick" | "done";
export type TaskKind = "lesson" | "practice" | "exam";
export type Task = { id: string; kind: TaskKind; subject?: string; topic?: string; title: string };

export type DayPlan = {
  index: number;
  date: string; // YYYY-MM-DD
  status: DayStatus;
  tasks: Task[];
  baseCount: number; // original task count (for the 25% cap)
  workloadFactor: number; // tasks.length / baseCount
};

export type Schedule = { startDate: string; targetDays: number; days: DayPlan[] };

const MAX_WORKLOAD = 1.25; // a day may absorb up to +25% (§10)

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0=Sun, 6=Sat
}

/**
 * Lay out topics across `targetDays`. Each weekday gets one lesson + one practice
 * per subject for the day's topic; weekends host a progressive exam.
 */
export function buildSchedule(input: {
  startDate: string;
  targetDays: number;
  subjects: string[];
  topics: string[]; // ordered standard codes
}): Schedule {
  const { startDate, targetDays, subjects, topics } = input;
  const weekdayIndexes: number[] = [];
  for (let i = 0; i < targetDays; i++) {
    const dow = dayOfWeek(addDays(startDate, i));
    if (dow !== 0 && dow !== 6) weekdayIndexes.push(i);
  }
  // Spread topics evenly across the weekdays.
  const topicForWeekday = (pos: number): string | undefined => {
    if (topics.length === 0 || weekdayIndexes.length === 0) return undefined;
    const t = Math.floor((pos * topics.length) / weekdayIndexes.length);
    return topics[Math.min(t, topics.length - 1)];
  };

  let weekdayPos = 0;
  const days: DayPlan[] = [];
  for (let i = 0; i < targetDays; i++) {
    const date = addDays(startDate, i);
    const dow = dayOfWeek(date);
    const tasks: Task[] = [];
    if (dow === 0 || dow === 6) {
      tasks.push({ id: `d${i}-exam`, kind: "exam", title: "Progressive exam" });
    } else {
      const topic = topicForWeekday(weekdayPos++);
      for (const subject of subjects) {
        tasks.push({ id: `d${i}-${subject}-lesson`, kind: "lesson", subject, topic, title: `${subject} lesson` });
        tasks.push({ id: `d${i}-${subject}-practice`, kind: "practice", subject, topic, title: `${subject} practice` });
      }
    }
    days.push({ index: i, date, status: "scheduled", tasks, baseCount: tasks.length, workloadFactor: tasks.length > 0 ? 1 : 0 });
  }
  return { startDate, targetDays, days };
}

/** Spare task slots a scheduled day can still absorb at ≤25% over its base. */
function spareCapacity(day: DayPlan): number {
  if (day.status !== "scheduled") return 0;
  const max = Math.ceil(day.baseCount * MAX_WORKLOAD);
  return Math.max(0, max - day.tasks.length);
}

/**
 * Re-fit the plan when a day is marked off/sick: redistribute its tasks forward,
 * raising upcoming days' workload up to 25%; extend the window only if needed.
 */
export function markDay(schedule: Schedule, index: number, status: "off" | "sick"): Schedule {
  const days = schedule.days.map((d) => ({ ...d, tasks: [...d.tasks] }));
  const target = days[index];
  if (!target) return schedule;

  const moving = target.tasks;
  target.tasks = [];
  target.status = status;
  target.workloadFactor = 0;

  // Pass 1 — fill upcoming scheduled days up to +25%.
  let remaining = [...moving];
  for (let i = index + 1; i < days.length && remaining.length > 0; i++) {
    const day = days[i]!;
    const cap = spareCapacity(day);
    if (cap <= 0) continue;
    const take = remaining.splice(0, cap);
    day.tasks.push(...take);
    day.workloadFactor = day.baseCount > 0 ? day.tasks.length / day.baseCount : 0;
  }

  // Pass 2 — extend the window if a ≤25% bump still couldn't fit it all.
  let extended = false;
  const baseSize = Math.max(1, Math.round(median(days.filter((d) => d.baseCount > 0).map((d) => d.baseCount))));
  while (remaining.length > 0) {
    extended = true;
    const last = days[days.length - 1]!;
    const date = addDays(last.date, 1);
    const take = remaining.splice(0, baseSize);
    days.push({ index: days.length, date, status: "scheduled", tasks: take, baseCount: baseSize, workloadFactor: take.length / baseSize });
  }

  return { ...schedule, targetDays: extended ? days.length : schedule.targetDays, days };
}

function median(xs: number[]): number {
  if (xs.length === 0) return 1;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/**
 * Streak = consecutive completed scheduled days ending at `uptoIndex`. Off and
 * sick days are NEUTRAL: skipped without breaking; a scheduled-but-not-done day
 * (a real miss) breaks the streak.
 */
export function computeStreak(schedule: Schedule, uptoIndex: number): number {
  let streak = 0;
  for (let i = Math.min(uptoIndex, schedule.days.length - 1); i >= 0; i--) {
    const d = schedule.days[i]!;
    if (d.status === "done") streak += 1;
    else if (d.status === "off" || d.status === "sick") continue; // neutral
    else break; // missed a scheduled day
  }
  return streak;
}

/** Next day the student should work (first scheduled, not-done, not off/sick). */
export function currentDayIndex(schedule: Schedule): number {
  const i = schedule.days.findIndex((d) => d.status === "scheduled");
  return i === -1 ? schedule.days.length : i;
}

/**
 * Work ahead: complete the next `count` scheduled days now. Marks them done and
 * returns how many were advanced (≤ available scheduled days).
 */
export function workAhead(schedule: Schedule, count: number): { schedule: Schedule; advanced: number } {
  const days = schedule.days.map((d) => ({ ...d }));
  let advanced = 0;
  for (let i = 0; i < days.length && advanced < count; i++) {
    if (days[i]!.status === "scheduled") {
      days[i]!.status = "done";
      advanced += 1;
    }
  }
  return { schedule: { ...schedule, days }, advanced };
}

/** Mark a specific day done (e.g. the student finished today's tasks). */
export function completeDay(schedule: Schedule, index: number): Schedule {
  const days = schedule.days.map((d) => (d.index === index && d.status === "scheduled" ? { ...d, status: "done" as const } : d));
  return { ...schedule, days };
}
