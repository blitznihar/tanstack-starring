import { COLLECTIONS, getCollection } from "./db.js";
import type { ScoringJob, ScoringJobStatus } from "~/schemas/scoringJob.js";

export type ScoringJobDoc = ScoringJob;

async function col() {
  const c = await getCollection<ScoringJobDoc>(COLLECTIONS.scoringJobs);
  // One job per (session, item) — re-finalizing must not enqueue duplicates.
  await c.createIndex({ examSessionId: 1, itemId: 1 }, { unique: true });
  await c.createIndex({ status: 1, createdAt: 1 });
  await c.createIndex({ enrollmentId: 1 });
  return c;
}

export const scoringJobsRepo = {
  /** Enqueue if absent (idempotent on (session,item)); returns true if newly inserted. */
  async enqueue(job: ScoringJobDoc): Promise<boolean> {
    const c = await col();
    const res = await c.updateOne(
      { examSessionId: job.examSessionId, itemId: job.itemId },
      { $setOnInsert: job },
      { upsert: true },
    );
    return res.upsertedCount === 1;
  },

  async findById(id: string): Promise<ScoringJobDoc | null> {
    return (await col()).findOne({ _id: id });
  },

  async listForSession(examSessionId: string): Promise<ScoringJobDoc[]> {
    return (await col()).find({ examSessionId }).sort({ createdAt: 1 }).toArray();
  },

  async listByStatus(statuses: ScoringJobStatus[]): Promise<ScoringJobDoc[]> {
    return (await col()).find({ status: { $in: statuses } }).sort({ createdAt: 1 }).toArray();
  },

  /**
   * Atomically claim a pending job for processing (pending → scoring) so two
   * workers never score the same job. Returns the claimed doc or null.
   */
  async claim(id: string): Promise<ScoringJobDoc | null> {
    const c = await col();
    const res = await c.findOneAndUpdate(
      { _id: id, status: "pending" },
      { $set: { status: "scoring", updatedAt: new Date() }, $inc: { attempts: 1 } },
      { returnDocument: "after" },
    );
    return res ?? null;
  },

  async update(id: string, patch: Partial<ScoringJobDoc>): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
  },

  /** Reset a stuck `scoring` job back to `pending` (worker died mid-call). */
  async releaseStale(id: string): Promise<void> {
    await (await col()).updateOne(
      { _id: id, status: "scoring" },
      { $set: { status: "pending", updatedAt: new Date() } },
    );
  },

  /**
   * Release a stuck `scoring` job, but give up after `maxAttempts` crash cycles:
   * a worker that keeps dying mid-DMR-call (OOM/SIGKILL/deploy) would otherwise
   * loop pending→scoring→stale→pending forever and never reach a human. Once
   * attempts are exhausted, route it to the manual queue terminally (§8: every
   * failure path ends in manual fallback). Atomic via an aggregation-pipeline
   * update so the branch can't race a concurrent claim.
   */
  async releaseStaleOrFail(id: string, maxAttempts: number): Promise<void> {
    await (await col()).updateOne({ _id: id, status: "scoring" }, [
      {
        $set: {
          status: { $cond: [{ $gte: ["$attempts", maxAttempts] }, "manual", "pending"] },
          error: {
            $cond: [
              { $gte: ["$attempts", maxAttempts] },
              `exceeded ${maxAttempts} scoring attempts (worker kept crashing)`,
              "$error",
            ],
          },
          updatedAt: "$$NOW",
        },
      },
    ]);
  },
};
