import { z } from "zod";
import { difficultySchema, figureSchema, richContentSchema } from "./common.js";

export const itemTypeSchema = z.enum([
  "multiple_choice",
  "multiselect",
  "multipart",
  "inline_choice",
  "text_entry",
  "hot_text",
  "hot_spot",
  "drag_and_drop",
  "number_line",
  "scr",
  "ecr",
]);
export type ItemType = z.infer<typeof itemTypeSchema>;

/** A single selectable option, carrying per-choice rationale (§5: why each distractor is wrong). */
export const optionSchema = z.object({
  key: z.string().min(1), // "A","B",...
  text: z.string(),
  correct: z.boolean().optional(),
  /** Why this distractor is wrong (omitted/ignored for the correct option). */
  rationale: z.string().optional(),
});
export type ItemOption = z.infer<typeof optionSchema>;

/** Rubric for SCR/ECR scored by the local model. */
export const rubricSchema = z.object({
  maxPoints: z.number().int().positive(),
  criteria: z.array(
    z.object({
      id: z.string().min(1),
      description: z.string().min(1),
      points: z.number().int().nonnegative(),
    }),
  ),
});
export type Rubric = z.infer<typeof rubricSchema>;

/** A multipart sub-question (Part A / Part B evidence items). */
export const partSchema = z.object({
  id: z.string().min(1),
  prompt: richContentSchema,
  type: itemTypeSchema,
  options: z.array(optionSchema).optional(),
  correct: z.unknown().optional(),
  answer: z.unknown().optional(),
  blanks: z.record(z.string(), z.string()).optional(),
  targets: z.array(z.object({ id: z.string(), accepts: z.array(z.string()) })).optional(),
});

/**
 * Item — the unit of content. Every item is programKey + subject + standard-tagged,
 * difficulty-tagged, with explanation (per-choice rationale) + workedSolution.
 * Answer-key shape varies by type; the discriminating validation lives in the
 * deterministic scorer (src/domain/scoring) and authoring import refinements.
 */
export const itemSchema = z.object({
  _id: z.string().min(1),
  bundleId: z.string().min(1),
  programKey: z.string().min(1),
  subject: z.string().min(1),
  standardCodes: z.array(z.string().min(1)).min(1), // REQUIRED
  type: itemTypeSchema,
  difficulty: difficultySchema,
  passageRef: z.string().optional(),
  prompt: richContentSchema,
  figures: z.array(figureSchema).default([]),

  // type-specific answer shapes (validated/narrowed by the scorer)
  options: z.array(optionSchema).optional(),
  correct: z.unknown().optional(), // string | string[] depending on type
  parts: z.array(partSchema).optional(),
  blanks: z.record(z.string(), z.string()).optional(), // blankId -> correct value (inline_choice/text_entry)
  answer: z.unknown().optional(), // text_entry / number_line value
  zones: z.array(z.object({ id: z.string(), x: z.number(), y: z.number(), r: z.number() })).optional(), // hot_spot
  tokens: z.array(z.object({ id: z.string(), text: z.string() })).optional(), // hot_text
  draggables: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  targets: z.array(z.object({ id: z.string(), accepts: z.array(z.string()) })).optional(),

  rubric: rubricSchema.optional(), // scr/ecr only

  points: z.number().int().positive().default(1),
  allowPartialCredit: z.boolean().default(false),

  explanation: richContentSchema, // why right / why each wrong choice is wrong
  workedSolution: richContentSchema, // full step-by-step
});
export type Item = z.infer<typeof itemSchema>;
