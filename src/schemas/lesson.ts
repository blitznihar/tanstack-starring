import { z } from "zod";
import { optionSchema } from "./item.js";
import { richContentSchema } from "./common.js";

export const lessonStatusSchema = z.enum(["draft", "available", "archived"]);
export type LessonStatus = z.infer<typeof lessonStatusSchema>;

export const lessonVisualKindSchema = z.enum([
  "number_line",
  "fraction_bars",
  "place_value",
  "array",
  "text_evidence",
  "steps",
]);
export type LessonVisualKind = z.infer<typeof lessonVisualKindSchema>;

export const lessonBlockSchema = z.union([
  z.object({
    kind: z.literal("heading"),
    text: z.string().min(1),
    level: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  }),
  z
    .object({
      kind: z.literal("paragraph"),
      text: z.string().optional(),
      html: z.string().optional(),
    })
    .refine((block) => !!block.text?.trim() || !!block.html?.trim(), "Paragraph needs text or html."),
  z.object({
    kind: z.literal("list"),
    items: z.array(z.string().min(1)).min(1),
    ordered: z.boolean().default(false),
  }),
  z.object({
    kind: z.literal("html"),
    html: z.string().min(1),
  }),
  z.object({
    kind: z.literal("svg"),
    svg: z.string().min(1),
    alt: z.string().min(1),
    caption: z.string().optional(),
  }),
  z
    .object({
      kind: z.literal("callout"),
      title: z.string().optional(),
      text: z.string().optional(),
      tone: z.enum(["info", "success", "warning"]).default("info"),
    })
    .refine((block) => !!block.title?.trim() || !!block.text?.trim(), "Callout needs a title or text."),
]);
export type LessonBlock = z.infer<typeof lessonBlockSchema>;

export const lessonVocabularySchema = z.object({
  term: z.string().min(1),
  meaning: z.string().min(1),
});
export type LessonVocabulary = z.infer<typeof lessonVocabularySchema>;

export const lessonPracticeExampleSchema = z.object({
  id: z.string().min(1).optional(),
  prompt: richContentSchema,
  options: z.array(optionSchema).default([]),
  answer: richContentSchema,
  explanation: richContentSchema.default([]),
});
export type LessonPracticeExample = z.infer<typeof lessonPracticeExampleSchema>;

export const lessonImportSchema = z.object({
  _id: z.string().min(1).optional(),
  programKey: z.string().min(1),
  subject: z.string().min(1),
  standardCode: z.string().min(1),
  version: z.number().int().positive().default(1),
  status: lessonStatusSchema.default("available"),
  title: z.string().min(1),
  reportingCategory: z.string().optional(),
  intro: z.string().min(1).optional(),
  vocabulary: z.array(lessonVocabularySchema).default([]),
  body: z.array(lessonBlockSchema).default([]),
  practiceExamples: z.array(lessonPracticeExampleSchema).default([]),
  visualKind: lessonVisualKindSchema.optional(),
});
export type LessonImport = z.infer<typeof lessonImportSchema>;

export const lessonDocSchema = lessonImportSchema.extend({
  _id: z.string().min(1),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type LessonDoc = z.infer<typeof lessonDocSchema>;
