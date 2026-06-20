import { z } from "zod";
import type { programSchema } from "~/schemas/program.js";

/**
 * Seed program definitions. Grade 3 STAAR is the first live program; SAT is seeded
 * as a separate top-level program (NOT nested under Grade 3 — §20.1). Nothing
 * hardcodes grade 3 elsewhere; the app reads these configs.
 *
 * Typed as schema INPUT so defaulted fields (conceptConfig, robuxRules) may be
 * omitted; seed.ts runs these through `programSchema.parse` before upsert.
 */
export const seedPrograms: z.input<typeof programSchema>[] = [
  {
    key: "grade3_staar",
    title: "Grade 3 STAAR",
    category: "K-12",
    subjects: ["math", "rla"],
    targetDays: 45,
    examBlueprint: {
      durationPresets: [30, 40, 50, 60, 70, 80, 90, 105, 120, 150, 180],
      defaultDurationMinutes: 60,
      defaultSplitPct: { math: 50, rla: 50 },
      breakSeconds: 300,
    },
    scoringModel: {
      levels: ["did_not_meet", "approaches", "meets", "masters"],
      conversionTables: [
        {
          subject: "math",
          year: 2024,
          rows: [
            { rawMin: 0, rawMax: 8, scale: 1100 },
            { rawMin: 9, rawMax: 16, scale: 1350 },
            { rawMin: 17, rawMax: 24, scale: 1500 },
            { rawMin: 25, rawMax: 32, scale: 1650 },
            { rawMin: 33, rawMax: 40, scale: 1800 },
          ],
          cutPoints: { approaches: 1350, meets: 1500, masters: 1700 },
        },
        {
          subject: "rla",
          year: 2024,
          rows: [
            { rawMin: 0, rawMax: 8, scale: 1100 },
            { rawMin: 9, rawMax: 16, scale: 1350 },
            { rawMin: 17, rawMax: 24, scale: 1500 },
            { rawMin: 25, rawMax: 32, scale: 1650 },
            { rawMin: 33, rawMax: 38, scale: 1800 },
          ],
          cutPoints: { approaches: 1350, meets: 1500, masters: 1700 },
        },
      ],
    },
    // Per-concept practice question counts (q) + exam minutes (m), from the prototype.
    // Math AND RLA — RLA is at parity with Math (§20.2): its own concepts, counts, minutes.
    conceptConfig: {
      // Math
      "3.2A": { q: 4, m: 8 },
      "3.2D": { q: 3, m: 6 },
      "3.4A": { q: 4, m: 8 },
      "3.4D": { q: 4, m: 8 },
      "3.4K": { q: 4, m: 10 },
      "3.5B": { q: 3, m: 6 },
      "3.3F": { q: 5, m: 10 },
      "3.3B": { q: 5, m: 10 },
      // RLA (Reading / Language Arts)
      "3.6F": { q: 4, m: 8 },
      "3.6G": { q: 2, m: 5 },
      "3.7C": { q: 3, m: 8 },
      "3.7D": { q: 2, m: 6 },
      "3.8B": { q: 3, m: 6 },
      "3.8C": { q: 2, m: 6 },
      "3.9D": { q: 3, m: 6 },
      "3.10A": { q: 2, m: 5 },
      "3.10D": { q: 2, m: 6 },
    },
    robuxRules: { practiceCorrect: 5, examCorrect: 20, examWrong: 10, lessonComplete: 25 },
    status: "live",
  },
  {
    key: "sat",
    title: "SAT",
    category: "College Prep",
    subjects: ["math", "reading_writing"],
    targetDays: 60,
    examBlueprint: {
      durationPresets: [60, 90, 120, 150, 180],
      defaultDurationMinutes: 180,
      defaultSplitPct: { math: 50, reading_writing: 50 },
      breakSeconds: 600,
    },
    scoringModel: { levels: ["did_not_meet", "approaches", "meets", "masters"], conversionTables: [] },
    status: "live",
  },
];

/** Demo accounts created on seed (passwords printed once). */
export const seedUsers = [
  { username: "superadmin", displayName: "Super Admin", email: "blitznihar@gmail.com", roles: ["super_admin"] as const },
  { username: "admin", displayName: "Admin", email: "blitznihar@gmail.com", roles: ["admin"] as const },
  { username: "parent", displayName: "Parent (Rivera)", email: "blitznihar@gmail.com", roles: ["parent"] as const },
  { username: "maya", displayName: "Maya Rivera", email: "blitznihar@gmail.com", roles: ["student"] as const },
];
