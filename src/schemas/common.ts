import { z } from "zod";

/**
 * RichContent — minimal portable rich text used for prompts, explanations, worked
 * solutions. A node is either a plain string or a tagged block. Kept deliberately
 * small; the renderer maps these to UI components.
 */
export const richNodeSchema: z.ZodType<RichNode> = z.lazy(() =>
  z.union([
    z.string(),
    z.object({
      kind: z.enum(["paragraph", "heading", "list", "math", "code", "figureRef", "blank"]),
      text: z.string().optional(),
      items: z.array(z.string()).optional(),
      figureId: z.string().optional(),
      blankId: z.string().optional(),
    }),
  ]),
);
export type RichNode =
  | string
  | {
      kind: "paragraph" | "heading" | "list" | "math" | "code" | "figureRef" | "blank";
      text?: string;
      items?: string[];
      figureId?: string;
      blankId?: string;
    };

export const richContentSchema = z.array(richNodeSchema);
export type RichContent = z.infer<typeof richContentSchema>;

export const difficultySchema = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof difficultySchema>;

/**
 * Figure renderers the player supports. Extends §5 with the §20.4 STAAR Math
 * visuals (dot plot, base-10 blocks, fraction strips, etc.). `kind` selects the
 * renderer; `data` carries renderer-specific config validated loosely here and
 * narrowed by each renderer.
 */
export const figureKindSchema = z.enum([
  "svg",
  "png",
  "bar_graph",
  "pictograph",
  "dot_plot",
  "number_line",
  "grid",
  "base10_blocks",
  "fraction_strip",
  "array_model",
  "area_model",
  "shape",
]);
export type FigureKind = z.infer<typeof figureKindSchema>;

export const figureSchema = z.object({
  id: z.string().min(1),
  kind: figureKindSchema,
  svg: z.string().optional(),
  assetId: z.string().optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  alt: z.string().min(1),
  caption: z.string().optional(),
});
export type Figure = z.infer<typeof figureSchema>;

/** Roles — accounts are managed as single-role profiles. */
export const roleSchema = z.enum(["super_admin", "admin", "parent", "student"]);
export type Role = z.infer<typeof roleSchema>;

/** Performance levels (STAAR-style). Cut points are configurable estimates, never hardcoded. */
export const performanceLevelSchema = z.enum([
  "did_not_meet",
  "approaches",
  "meets",
  "masters",
]);
export type PerformanceLevel = z.infer<typeof performanceLevelSchema>;

/** Common timestamp fields every persisted document carries. */
export const timestampsSchema = z.object({
  createdAt: z.date(),
  updatedAt: z.date(),
});

/** An ISO-ish date string (YYYY-MM-DD) used for schedule day plans. */
export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD date string");
