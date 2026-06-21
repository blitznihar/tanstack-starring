/**
 * Per-enrollment scheduler — PURE.
 *
 * This is a program-day scheduler: `targetDays` is the fixed work budget, while
 * the calendar can stretch for sick/off days or compress for accelerated days.
 * Lessons always include their matching practice. During the learning phase,
 * Mon-Thu are lesson slots and Fri-Sun are exam slots; exam slots convert to
 * lesson days until enough topics have been taught. After all topics are taught,
 * every remaining program day is an exam: 1 hour Mon-Thu, 3 hours Fri-Sun.
 */

export type DayStatus = "scheduled" | "off" | "sick" | "done";
export type TaskKind = "lesson" | "practice" | "exam";
export type Task = {
  id: string;
  kind: TaskKind;
  subject?: string;
  topic?: string;
  topicNumber?: number;
  title: string;
  durationMinutes?: number;
};

export type DayType = "lessons_practice" | "exam_long" | "exam_short" | "sick_off" | "empty";
export type SlotKind = "LESSON" | "EXAM";
export type LessonRange = { subject: string; from: number; to: number; topics: string[] };
export type DayStatusOverride =
  | { kind: "active"; multiplier: number }
  | { kind: "sick_off"; status: "off" | "sick" };

export type ScheduleConfig = {
  startDate: string;
  targetDays: number;
  subjects: string[];
  topicsBySubject: Record<string, string[]>;
  quotaBySubject: Record<string, number>;
  lessonWeekdays: number[];
  examWeekdays: number[];
  theta: number;
  shortExamMinutes: number;
  longExamMinutes: number;
};

export type DayPlan = {
  index: number;
  date: string; // YYYY-MM-DD
  status: DayStatus;
  tasks: Task[];
  baseCount: number; // original task count (for the 25% cap)
  workloadFactor: number; // tasks.length / baseCount
  dayType?: DayType;
  slot?: SlotKind;
  lessonRanges?: LessonRange[];
  programDayStart?: number;
  programDayEnd?: number;
  programDaysUsed?: number;
  remainingAfter?: number;
  multiplier?: number;
};

export type Schedule = {
  startDate: string;
  targetDays: number;
  days: DayPlan[];
  config?: ScheduleConfig;
  dayStatus?: Record<string, DayStatusOverride>;
  doneDates?: Record<string, true>;
};

function addDays(date: string, n: number): string {
  const d = new Date(date + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function dayOfWeek(date: string): number {
  return new Date(date + "T00:00:00Z").getUTCDay(); // 0=Sun, 6=Sat
}

function titleCase(value: string): string {
  return value.replace(/[_-]/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clampMultiplier(value: number | undefined): number {
  if (!Number.isFinite(value ?? 1)) return 1;
  return Math.max(1, Math.floor(value ?? 1));
}

function uniqueSubjects(subjects: string[]): string[] {
  return [...new Set(subjects.filter(Boolean))];
}

function copyTopics(topicsBySubject: Record<string, string[]>, subjects: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const subject of subjects) out[subject] = [...(topicsBySubject[subject] ?? [])];
  return out;
}

export function deriveQuotaBySubject(input: {
  startDate: string;
  targetDays: number;
  subjects: string[];
  topicsBySubject: Record<string, string[]>;
  lessonWeekdays?: number[];
}): Record<string, number> {
  const lessonWeekdays = input.lessonWeekdays ?? [1, 2, 3, 4];
  let availableLessonDays = 0;
  for (let i = 0; i < input.targetDays; i++) {
    if (lessonWeekdays.includes(dayOfWeek(addDays(input.startDate, i)))) availableLessonDays += 1;
  }
  const divisor = Math.max(1, availableLessonDays);
  const out: Record<string, number> = {};
  for (const subject of input.subjects) {
    const topicCount = input.topicsBySubject[subject]?.length ?? 0;
    out[subject] = Math.max(1, Math.ceil(topicCount / divisor));
  }
  return out;
}

function examTask(index: number, durationMinutes: number): Task {
  const hours = durationMinutes / 60;
  return {
    id: `d${index}-exam`,
    kind: "exam",
    title: `${hours}-hour progressive exam`,
    durationMinutes,
  };
}

function withWorkload(day: DayPlan): DayPlan {
  return {
    ...day,
    workloadFactor: day.status === "scheduled" && day.baseCount > 0 ? day.tasks.length / day.baseCount : 0,
  };
}

function dayTypeForExam(durationMinutes: number): DayType {
  return durationMinutes >= 180 ? "exam_long" : "exam_short";
}

function makeLessonTasks(dayIndex: number, ranges: LessonRange[]): Task[] {
  const tasks: Task[] = [];
  for (const range of ranges) {
    range.topics.forEach((topic, offset) => {
      const topicNumber = range.from + offset;
      const baseId = `d${dayIndex}-${range.subject}-${topicNumber}`;
      tasks.push({
        id: `${baseId}-lesson`,
        kind: "lesson",
        subject: range.subject,
        topic,
        topicNumber,
        title: `${titleCase(range.subject)} lesson ${topicNumber}`,
      });
      tasks.push({
        id: `${baseId}-practice`,
        kind: "practice",
        subject: range.subject,
        topic,
        topicNumber,
        title: `${titleCase(range.subject)} practice ${topicNumber}`,
      });
    });
  }
  return tasks;
}

export function buildSchedule(input: {
  startDate: string;
  targetDays: number;
  subjects: string[];
  topicsBySubject: Record<string, string[]>; // ordered standard codes by subject
  quotaBySubject?: Record<string, number>;
  lessonWeekdays?: number[];
  examWeekdays?: number[];
  theta?: number;
  shortExamMinutes?: number;
  longExamMinutes?: number;
  dayStatus?: Record<string, DayStatusOverride>;
  doneDates?: Record<string, true>;
}): Schedule {
  const subjects = uniqueSubjects(input.subjects);
  const lessonWeekdays = input.lessonWeekdays ?? [1, 2, 3, 4];
  const examWeekdays = input.examWeekdays ?? [5, 6, 0];
  const theta = input.theta ?? 4;
  const shortExamMinutes = input.shortExamMinutes ?? 60;
  const longExamMinutes = input.longExamMinutes ?? 180;
  const topicsBySubject = copyTopics(input.topicsBySubject, subjects);
  const quotaBySubject = {
    ...deriveQuotaBySubject({ startDate: input.startDate, targetDays: input.targetDays, subjects, topicsBySubject, lessonWeekdays }),
    ...(input.quotaBySubject ?? {}),
  };
  const config: ScheduleConfig = {
    startDate: input.startDate,
    targetDays: input.targetDays,
    subjects,
    topicsBySubject,
    quotaBySubject,
    lessonWeekdays,
    examWeekdays,
    theta,
    shortExamMinutes,
    longExamMinutes,
  };

  let remaining = input.targetDays;
  let date = input.startDate;
  const taughtBySubject: Record<string, number> = Object.fromEntries(subjects.map((subject) => [subject, 0]));
  const days: DayPlan[] = [];

  const allTopicsTaught = () => subjects.every((subject) => (taughtBySubject[subject] ?? 0) >= (topicsBySubject[subject]?.length ?? 0));
  const taughtTotal = () => subjects.reduce((sum, subject) => sum + (taughtBySubject[subject] ?? 0), 0);
  const teach = (dayIndex: number, multiplier: number): { ranges: LessonRange[]; tasks: Task[] } => {
    const ranges: LessonRange[] = [];
    for (const subject of subjects) {
      const topics = topicsBySubject[subject] ?? [];
      const taught = taughtBySubject[subject] ?? 0;
      if (taught >= topics.length) continue;
      const quota = Math.max(1, quotaBySubject[subject] ?? 1);
      const take = Math.min(multiplier * quota, topics.length - taught);
      if (take <= 0) continue;
      const selected = topics.slice(taught, taught + take);
      taughtBySubject[subject] = taught + take;
      ranges.push({ subject, from: taught + 1, to: taught + take, topics: selected });
    }
    return { ranges, tasks: makeLessonTasks(dayIndex, ranges) };
  };

  while (remaining > 0) {
    const index = days.length;
    const override = input.dayStatus?.[date];
    const slot: SlotKind = lessonWeekdays.includes(dayOfWeek(date)) ? "LESSON" : "EXAM";

    if (override?.kind === "sick_off") {
      days.push(withWorkload({
        index,
        date,
        status: override.status,
        tasks: [],
        baseCount: 0,
        workloadFactor: 0,
        dayType: "sick_off",
        slot,
        remainingAfter: remaining,
      }));
      date = addDays(date, 1);
      continue;
    }

    const programDayStart = input.targetDays - remaining + 1;
    const multiplier = clampMultiplier(override?.kind === "active" ? override.multiplier : 1);
    let tasks: Task[] = [];
    let lessonRanges: LessonRange[] = [];
    let dayType: DayType = "empty";
    let programDaysUsed = 1;
    let baseCount = 0;

    if (allTopicsTaught()) {
      const durationMinutes = slot === "LESSON" ? shortExamMinutes : longExamMinutes;
      tasks = [examTask(index, durationMinutes)];
      dayType = dayTypeForExam(durationMinutes);
      programDaysUsed = 1;
      baseCount = tasks.length;
    } else if (slot === "LESSON") {
      const taught = teach(index, multiplier);
      lessonRanges = taught.ranges;
      tasks = taught.tasks;
      dayType = "lessons_practice";
      programDaysUsed = multiplier;
      const normal = lessonRanges.reduce((sum, range) => {
        const normalTake = Math.min(range.to - range.from + 1, Math.max(1, quotaBySubject[range.subject] ?? 1));
        return sum + normalTake * 2;
      }, 0);
      baseCount = Math.max(1, normal || tasks.length);
    } else if (taughtTotal() >= theta) {
      tasks = [examTask(index, longExamMinutes)];
      dayType = "exam_long";
      programDaysUsed = 1;
      baseCount = tasks.length;
    } else {
      const taught = teach(index, 1);
      lessonRanges = taught.ranges;
      tasks = taught.tasks;
      dayType = "lessons_practice";
      programDaysUsed = 1;
      baseCount = tasks.length;
    }

    const remainingAfter = Math.max(0, remaining - programDaysUsed);
    const programDayEnd = Math.min(input.targetDays, input.targetDays - remainingAfter);
    const status: DayStatus = input.doneDates?.[date] ? "done" : "scheduled";
    days.push(withWorkload({
      index,
      date,
      status,
      tasks,
      baseCount,
      workloadFactor: 0,
      dayType,
      slot,
      lessonRanges,
      programDayStart,
      programDayEnd,
      programDaysUsed,
      remainingAfter,
      multiplier,
    }));
    remaining = remainingAfter;
    date = addDays(date, 1);
  }
  return {
    startDate: input.startDate,
    targetDays: input.targetDays,
    days,
    config,
    dayStatus: input.dayStatus ?? {},
    doneDates: input.doneDates ?? {},
  };
}

function rebuildFromSchedule(schedule: Schedule, overrides: Partial<Pick<Schedule, "dayStatus" | "doneDates">>): Schedule {
  if (!schedule.config) return schedule;
  return buildSchedule({
    ...schedule.config,
    dayStatus: overrides.dayStatus ?? schedule.dayStatus ?? {},
    doneDates: overrides.doneDates ?? schedule.doneDates ?? {},
  });
}

export function markDay(schedule: Schedule, index: number, status: "off" | "sick"): Schedule {
  const target = schedule.days[index];
  if (!target) return schedule;
  if (target.status === "done") return schedule;
  if (!schedule.config) return legacyMarkDay(schedule, index, status);
  const dayStatus = { ...(schedule.dayStatus ?? {}), [target.date]: { kind: "sick_off" as const, status } };
  const doneDates = { ...(schedule.doneDates ?? {}) };
  delete doneDates[target.date];
  return rebuildFromSchedule(schedule, { dayStatus, doneDates });
}

/** Remove a manual off/sick day and pull the remaining dates back. */
export function unmarkDay(schedule: Schedule, index: number): Schedule {
  const target = schedule.days[index];
  if (!target || (target.status !== "off" && target.status !== "sick")) return schedule;
  if (!schedule.config) return legacyUnmarkDay(schedule, index);
  const dayStatus = { ...(schedule.dayStatus ?? {}) };
  delete dayStatus[target.date];
  return rebuildFromSchedule(schedule, { dayStatus });
}

export function accelerateDay(schedule: Schedule, index: number, multiplier: number): Schedule {
  const target = schedule.days[index];
  if (!target || target.status !== "scheduled" || !schedule.config) return schedule;
  const dayStatus = { ...(schedule.dayStatus ?? {}) };
  dayStatus[target.date] = { kind: "active", multiplier: clampMultiplier(multiplier) };
  return rebuildFromSchedule(schedule, { dayStatus });
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
  const doneDates = { ...(schedule.doneDates ?? {}) };
  const days = schedule.days.map((d) => ({ ...d }));
  let advanced = 0;
  for (let i = 0; i < days.length && advanced < count; i++) {
    if (days[i]!.status === "scheduled") {
      days[i]!.status = "done";
      doneDates[days[i]!.date] = true;
      advanced += 1;
    }
  }
  return { schedule: { ...schedule, days, doneDates }, advanced };
}

/** Mark a specific day done (e.g. the student finished today's tasks). */
export function completeDay(schedule: Schedule, index: number): Schedule {
  const doneDates = { ...(schedule.doneDates ?? {}) };
  const days = schedule.days.map((d) => (d.index === index && d.status === "scheduled" ? { ...d, status: "done" as const } : d));
  const target = schedule.days[index];
  if (target?.status === "scheduled") doneDates[target.date] = true;
  return { ...schedule, days, doneDates };
}

/** Reopen any completed day that contains the matching lesson/practice topic. */
export function reopenDayForTopic(schedule: Schedule, input: { subject: string; topic: string }): Schedule {
  const doneDates = { ...(schedule.doneDates ?? {}) };
  const days = schedule.days.map((day) => {
    const matches = day.tasks.some((task) => task.subject === input.subject && task.topic === input.topic);
    if (matches) delete doneDates[day.date];
    return matches && day.status === "done" ? { ...day, status: "scheduled" as const } : day;
  });
  return { ...schedule, days, doneDates };
}

function legacyMarkDay(schedule: Schedule, index: number, status: "off" | "sick"): Schedule {
  const target = schedule.days[index];
  if (!target) return schedule;
  const flexDay: DayPlan = { ...target, status, tasks: [], baseCount: 0, workloadFactor: 0, dayType: "sick_off" };
  const movedDay: DayPlan = { ...target, status: "scheduled", tasks: [...target.tasks], workloadFactor: 1 };
  const days = [
    ...schedule.days.slice(0, index).map((day) => ({ ...day, tasks: [...day.tasks] })),
    flexDay,
    movedDay,
    ...schedule.days.slice(index + 1).map((day) => ({ ...day, tasks: [...day.tasks] })),
  ].map((day, i) => ({ ...day, index: i, date: addDays(schedule.startDate, i) }));
  return { ...schedule, days };
}

function legacyUnmarkDay(schedule: Schedule, index: number): Schedule {
  const days = schedule.days
    .filter((_, i) => i !== index)
    .map((day, i) => ({ ...day, index: i, date: addDays(schedule.startDate, i), tasks: [...day.tasks] }));
  return { ...schedule, days };
}
