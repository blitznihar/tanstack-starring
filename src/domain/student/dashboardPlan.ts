export type DashboardDayCandidate = {
  index: number;
  date: string;
  status: string;
};

export type DashboardTaskCandidate = {
  completed: boolean;
};

export type WorkDateRelation = "today" | "tomorrow" | "future";

function addDaysIso(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

export function workDateRelation(workDate: string | undefined, calendarDate: string): WorkDateRelation {
  if (!workDate || workDate <= calendarDate) return "today";
  return workDate === addDaysIso(calendarDate, 1) ? "tomorrow" : "future";
}

export function planSectionLabel(workDate: string | undefined, calendarDate: string): string {
  const relation = workDateRelation(workDate, calendarDate);
  if (relation === "tomorrow") return "Tomorrow's plan";
  if (relation === "future") return "Next plan";
  return "Today's plan";
}

export function workCtaLabel(action: "Start" | "Continue", workDate: string | undefined, calendarDate: string): string {
  const relation = workDateRelation(workDate, calendarDate);
  if (relation === "tomorrow") return `${action} tomorrow's work`;
  if (relation === "future") return `${action} next work day`;
  return `${action} today's work`;
}

export function selectDashboardWorkDay(input: {
  days: DashboardDayCandidate[];
  scheduleCurrentDay: number;
  calendarDate: string;
  taskViewsByDay: Map<number, DashboardTaskCandidate[]>;
}): {
  currentDay: DashboardDayCandidate | undefined;
  nextWorkDay: DashboardDayCandidate | undefined;
  latestFinishedDay: DashboardDayCandidate | undefined;
} {
  const nextWorkDay =
    input.days[input.scheduleCurrentDay]?.status === "scheduled"
      ? input.days[input.scheduleCurrentDay]
      : input.days.find((day) => day.status === "scheduled");
  const nextWorkTasks = nextWorkDay ? input.taskViewsByDay.get(nextWorkDay.index) ?? [] : [];
  const nextWorkHasStarted = nextWorkTasks.some((task) => task.completed);
  const nextWorkIsDue = !!nextWorkDay && nextWorkDay.date <= input.calendarDate;
  const latestFinishedDay = input.days
    .filter((day) => {
      if (nextWorkDay && day.index >= nextWorkDay.index) return false;
      const views = input.taskViewsByDay.get(day.index) ?? [];
      return views.length > 0 && views.every((task) => task.completed);
    })
    .at(-1);
  const currentDay =
    nextWorkDay && (nextWorkHasStarted || nextWorkIsDue)
      ? nextWorkDay
      : latestFinishedDay ?? nextWorkDay;
  return { currentDay, nextWorkDay, latestFinishedDay };
}
