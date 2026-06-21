import { z } from "zod";

/**
 * A scoringJob (§8) — the async queue entry for a written response (SCR/ECR).
 * Submission NEVER blocks on scoring: deterministic items score immediately and a
 * job is enqueued per written item. A worker calls the configured AI scorer
 * (OpenAI in production, the only runtime LLM call); on failure or
 * AI_ENABLED=false it routes to the manual queue.
 * A parent/admin can override the final score one click.
 *
 *   pending   → just enqueued, not yet attempted
 *   scoring   → a worker is calling the AI scorer right now
 *   scored    → AI returned a parsed score
 *   manual    → AI unreachable/disabled/unparseable → awaits a human
 *   overridden→ a parent/admin set the final score (wins over any AI score)
 */
export const scoringJobStatusSchema = z.enum(["pending", "scoring", "scored", "manual", "overridden"]);
export type ScoringJobStatus = z.infer<typeof scoringJobStatusSchema>;

export const scoringSourceSchema = z.enum(["ai", "manual", "override"]);
export type ScoringSource = z.infer<typeof scoringSourceSchema>;

/** The strict JSON AI scorer must reply with (§8). Parsed defensively. */
export const dmrReplySchema = z.object({
  score: z.number(),
  justification: z.string(),
  tips: z.union([z.string(), z.array(z.string())]).optional(),
});
export type DmrReply = z.infer<typeof dmrReplySchema>;

export const scoringJobSchema = z.object({
  _id: z.string(),
  examSessionId: z.string().min(1),
  enrollmentId: z.string().min(1),
  itemId: z.string().min(1),
  subject: z.string().min(1),
  itemType: z.enum(["scr", "ecr"]),
  maxPoints: z.number().int().positive(),
  /** The student's written response (verbatim) to be scored. */
  responseText: z.string().default(""),
  status: scoringJobStatusSchema.default("pending"),
  source: scoringSourceSchema.optional(),
  score: z.number().nullable().default(null),
  justification: z.string().default(""),
  tips: z.array(z.string()).default([]),
  /** Last error if AI failed — surfaced to the manual queue for context. */
  error: z.string().optional(),
  attempts: z.number().int().nonnegative().default(0),
  createdAt: z.date(),
  updatedAt: z.date(),
  scoredAt: z.date().optional(),
});
export type ScoringJob = z.infer<typeof scoringJobSchema>;
