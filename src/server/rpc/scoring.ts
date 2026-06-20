import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { manualQueue, overrideScore } from "~/server/scoring/scoring.js";
import { requireAuth } from "./context.js";

const setWrittenScoreInput = z.object({
  jobId: z.string().min(1),
  score: z.number().finite(),
  justification: z.string().optional(),
});

/** The human scoring queue (§8) — written responses needing review/override. */
export const scoringQueue = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return manualQueue(auth);
});

/** Parent/admin one-click override — sets the final score for one written item. */
export const setWrittenScore = createServerFn({ method: "POST" })
  .validator((d: unknown) => setWrittenScoreInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return overrideScore(auth, data);
  });
