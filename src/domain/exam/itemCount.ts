const ONE_HOUR_SECONDS = 60 * 60;

const MATH_MINIMUM_ITEMS_AT_60_MINUTES = 45;
const MATH_SECONDS_PER_ITEM = 90;
const ENGLISH_SECONDS_PER_ITEM = 216;
const ENGLISH_SUBJECTS = new Set(["rla", "english", "ela", "reading", "reading_writing", "language_arts"]);

function normalizeSubject(subject: string): string {
  return subject.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

export function minimumItemsForExam(input: {
  subjects: string[];
  splitPct: Record<string, number>;
  durationSeconds: number;
}): number {
  if (input.durationSeconds < ONE_HOUR_SECONDS) return 0;

  return input.subjects.reduce((total, subject) => {
    const normalizedSubject = normalizeSubject(subject);
    const subjectSplit = Math.max(0, input.splitPct[subject] ?? 0) / 100;
    if (subjectSplit <= 0) return total;

    const subjectSeconds = Math.floor(input.durationSeconds * subjectSplit);
    if (normalizedSubject === "math") {
      const byRate = Math.floor(subjectSeconds / MATH_SECONDS_PER_ITEM);
      const withOneHourFloor = subjectSeconds >= ONE_HOUR_SECONDS
        ? Math.max(MATH_MINIMUM_ITEMS_AT_60_MINUTES, byRate)
        : byRate;
      return total + withOneHourFloor;
    }
    if (ENGLISH_SUBJECTS.has(normalizedSubject)) {
      return total + Math.floor(subjectSeconds / ENGLISH_SECONDS_PER_ITEM);
    }
    return total;
  }, 0);
}

export function resolveExamTotalItems(input: {
  requestedTotalItems?: number;
  fallbackTotalItems: number;
  subjects: string[];
  splitPct: Record<string, number>;
  durationSeconds: number;
}): number {
  const requested = input.requestedTotalItems ?? input.fallbackTotalItems;
  return Math.max(
    requested,
    minimumItemsForExam({
      subjects: input.subjects,
      splitPct: input.splitPct,
      durationSeconds: input.durationSeconds,
    }),
  );
}
