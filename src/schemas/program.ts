import { z } from "zod";
import { performanceLevelSchema } from "./common.js";

/**
 * Program — a curriculum track. Grade 3 is just the first seeded program; nothing
 * hardcodes "grade 3" or a fixed subject list — everything reads program config.
 */

/** Exam blueprint: how exams for this program are sized and split across subjects. */
export const examBlueprintSchema = z.object({
  /** Allowed duration presets in minutes (configurable set, up to 180). */
  durationPresets: z.array(z.number().int().positive()).default([30, 40, 50, 60, 70, 80, 90, 105, 120, 150, 180]),
  defaultDurationMinutes: z.number().int().positive().default(60),
  /** Subject split percentages keyed by subject; must cover the program's subjects and total 100. */
  defaultSplitPct: z.record(z.string(), z.number().min(0).max(100)),
  breakSeconds: z.number().int().nonnegative().default(300),
});
export type ExamBlueprint = z.infer<typeof examBlueprintSchema>;

/** A raw→scale conversion row and the cut points → performance level. */
export const conversionTableSchema = z.object({
  subject: z.string().min(1),
  year: z.number().int(),
  /** Sorted ascending by rawMin. Each row maps a raw-score band to a scale score. */
  rows: z
    .array(
      z.object({
        rawMin: z.number().int().nonnegative(),
        rawMax: z.number().int().nonnegative(),
        scale: z.number().int(),
      }),
    )
    .min(1),
  /** Scale-score cut points (inclusive lower bounds) per performance level. Estimates; configurable. */
  cutPoints: z.object({
    approaches: z.number().int(),
    meets: z.number().int(),
    masters: z.number().int(),
  }),
});
export type ConversionTable = z.infer<typeof conversionTableSchema>;

export const scoringModelSchema = z.object({
  conversionTables: z.array(conversionTableSchema).default([]),
  levels: z.array(performanceLevelSchema).default(["did_not_meet", "approaches", "meets", "masters"]),
});
export type ScoringModel = z.infer<typeof scoringModelSchema>;

/**
 * Per-concept practice config (§6): number of practice questions (`q`) and exam
 * minutes (`m`), keyed by standard/TEKS code. Configured by admin/super_admin.
 */
export const conceptConfigSchema = z.record(
  z.string(),
  z.object({ q: z.number().int().nonnegative(), m: z.number().int().nonnegative() }),
);
export type ConceptConfig = z.infer<typeof conceptConfigSchema>;

/**
 * Robux EARNING rules (§20.5) — per-event point values, the single source of
 * truth for all earning. Separate from milestone reward rules (§11.B).
 */
export const robuxRulesSchema = z.object({
  practiceCorrect: z.number().int().nonnegative().default(5),
  examCorrect: z.number().int().nonnegative().default(20),
  examWrong: z.number().int().nonnegative().default(10),
  lessonComplete: z.number().int().nonnegative().default(25),
});
export type RobuxRules = z.infer<typeof robuxRulesSchema>;

export const DEFAULT_ROBUX_RULES: RobuxRules = {
  practiceCorrect: 5,
  examCorrect: 20,
  examWrong: 10,
  lessonComplete: 25,
};

export const programStatusSchema = z.enum(["live", "setup", "soon", "archived"]);

export const programSchema = z.object({
  _id: z.string().optional(),
  key: z.string().min(1), // grade3_staar, grade4_staar, sat, gre, ...
  title: z.string().min(1),
  category: z.string().default("K-12"), // "K-12" | "College Prep" | ...
  subjects: z.array(z.string().min(1)).min(1),
  targetDays: z.number().int().positive().default(45),
  examBlueprint: examBlueprintSchema,
  scoringModel: scoringModelSchema.default({ conversionTables: [], levels: ["did_not_meet", "approaches", "meets", "masters"] }),
  conceptConfig: conceptConfigSchema.default({}),
  robuxRules: robuxRulesSchema.default(DEFAULT_ROBUX_RULES),
  status: programStatusSchema.default("live"),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type Program = z.infer<typeof programSchema>;
