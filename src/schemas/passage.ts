import { z } from "zod";
import { richContentSchema } from "./common.js";

/**
 * A reading passage for RLA (§20.2). Items reference a passage by `passageRef`
 * (the passage `id`). Passages are part of a content bundle and persisted in
 * their own collection so the reading pane can render the full text while
 * questions reference it. Original passages only (§18) — no copyrighted text.
 */
export const passageSchema = z.object({
  _id: z.string().optional(), // assigned on import: `${bundleId}:passage:${id}`
  id: z.string().min(1), // bundle-local id referenced by item.passageRef
  bundleId: z.string().optional(), // assigned on import
  programKey: z.string().min(1),
  subject: z.string().min(1),
  title: z.string().min(1),
  genre: z.string().default("informational"), // literary | informational | drama | poetry | paired
  /** Lexile-ish band label, e.g. "Grade 3 · 540L". Display only. */
  level: z.string().optional(),
  /** Numbered paragraphs render in the reading pane; RichContent for portability. */
  body: richContentSchema,
  wordCount: z.number().int().nonnegative().optional(),
});
export type Passage = z.infer<typeof passageSchema>;
