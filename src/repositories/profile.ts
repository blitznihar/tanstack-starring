import type { ClientSession } from "mongodb";
import { COLLECTIONS, getClient, getCollection, getDb } from "./db.js";

/**
 * Cross-collection profile IO (§13) — kept in the repository layer so nothing
 * else touches the driver. Exports one student across ALL their enrollments and,
 * on import, replaces that student's data wholesale. Content (programs/bundles/
 * items/passages/standards) is intentionally NOT touched — profiles reference
 * programs by key only.
 */

type Doc = { _id?: string } & Record<string, unknown>;

/** Collections keyed by enrollmentId — the bulk of a student's data. */
const BY_ENROLLMENT = [
  "responses",
  "examSessions",
  "exams",
  "itemUsage",
  "lessonProgress",
  "practiceProgress",
  "masteryStates",
  "robuxLedger",
  "redemptions",
  "schedules",
  "scoringJobs",
] as const;
type EnrollmentColKey = (typeof BY_ENROLLMENT)[number];

async function col(name: string) {
  return getCollection<Doc>(name);
}

/** A standalone mongod (typical local dev) can't run multi-doc transactions. */
function isTransactionUnsupported(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; codeName?: unknown; message?: unknown };
  const msg = typeof e.message === "string" ? e.message : "";
  return (
    e.code === 20 ||
    e.codeName === "IllegalOperation" ||
    /Transaction numbers are only allowed on a replica set/i.test(msg) ||
    /Transactions are not supported/i.test(msg) ||
    /does not support transactions/i.test(msg)
  );
}

export type ProfileBundle = {
  user: Doc | null;
  programKeys: string[];
  enrollments: Doc[];
  rewardRules: Doc[];
} & Record<EnrollmentColKey, Doc[]>;

export const profileRepo = {
  /** The exportedAt of the last import applied here (LWW marker), or null. */
  async getMarker(studentId: string): Promise<string | null> {
    const u = await (await col(COLLECTIONS.users)).findOne({ _id: studentId });
    const v = u?.profileExportedAt;
    return typeof v === "string" ? v : null;
  },

  async exportStudent(studentId: string): Promise<ProfileBundle> {
    const user = await (await col(COLLECTIONS.users)).findOne({ _id: studentId });
    const enrollments = await (await col(COLLECTIONS.enrollments)).find({ studentId }).toArray();
    const enrollmentIds = enrollments.map((e) => e._id);
    const programKeys = [...new Set(enrollments.map((e) => String(e.programKey)))];

    const out: ProfileBundle = {
      user,
      programKeys,
      enrollments,
      rewardRules: await (await col(COLLECTIONS.rewardRules)).find({ studentId }).toArray(),
      responses: [],
      examSessions: [],
      exams: [],
      itemUsage: [],
      lessonProgress: [],
      practiceProgress: [],
      masteryStates: [],
      robuxLedger: [],
      redemptions: [],
      schedules: [],
      scoringJobs: [],
    };

    for (const name of BY_ENROLLMENT) {
      out[name] = await (await col(COLLECTIONS[name])).find({ enrollmentId: { $in: enrollmentIds } }).toArray();
    }
    return out;
  },

  /**
   * Replace a student's whole profile (LWW apply). Deletes the student's existing
   * per-enrollment data across the union of current + incoming enrollment ids,
   * then inserts the incoming docs. Preserves any existing password hash; stamps
   * the LWW marker (`profileExportedAt`).
   *
   * Runs inside a MongoDB transaction so a mid-way failure can never leave a
   * half-deleted, orphaned profile (a "replace whole student" must be all-or-
   * nothing). A standalone mongod (typical local dev) can't run transactions, so
   * we transparently fall back to the same sequence without one — atomic on a
   * replica set / Atlas, best-effort locally.
   */
  async replaceStudent(
    studentId: string,
    payload: {
      exportedAt: string;
      user: Doc;
      enrollments: Doc[];
      rewardRules: Doc[];
    } & Record<EnrollmentColKey, Doc[]>,
  ): Promise<void> {
    const db = await getDb();
    const { _id: _ignore, passwordHash: _drop, createdAt: _c, ...userRest } = payload.user;

    const run = async (session?: ClientSession): Promise<void> => {
      const opts = session ? { session } : {};
      const existingEnrollments = await db
        .collection<Doc>(COLLECTIONS.enrollments)
        .find({ studentId }, opts)
        .toArray();
      const ids = [
        ...new Set([...existingEnrollments.map((e) => e._id), ...payload.enrollments.map((e) => e._id)]),
      ];

      for (const name of BY_ENROLLMENT) {
        const c = db.collection<Doc>(COLLECTIONS[name]);
        await c.deleteMany({ enrollmentId: { $in: ids } }, opts);
        const docs = payload[name] ?? [];
        if (docs.length) await c.insertMany(docs, opts);
      }

      const rewards = db.collection<Doc>(COLLECTIONS.rewardRules);
      await rewards.deleteMany({ studentId }, opts);
      if (payload.rewardRules.length) await rewards.insertMany(payload.rewardRules, opts);

      const enrollmentsCol = db.collection<Doc>(COLLECTIONS.enrollments);
      await enrollmentsCol.deleteMany({ studentId }, opts);
      if (payload.enrollments.length) await enrollmentsCol.insertMany(payload.enrollments, opts);

      // Upsert the user, preserving credentials (the export excludes passwordHash).
      const usersCol = db.collection<Doc>(COLLECTIONS.users);
      const existing = await usersCol.findOne({ _id: studentId }, opts);
      await usersCol.updateOne(
        { _id: studentId },
        {
          $set: {
            ...userRest,
            passwordHash: existing?.passwordHash ?? "imported-no-credential",
            profileExportedAt: payload.exportedAt,
            updatedAt: new Date(),
          },
          $setOnInsert: { _id: studentId, createdAt: new Date() },
        },
        { upsert: true, ...opts },
      );
    };

    const client = await getClient();
    const session = client.startSession();
    try {
      await session.withTransaction(() => run(session));
    } catch (err) {
      if (isTransactionUnsupported(err)) {
        // Standalone mongod — no multi-doc transactions. The transaction is
        // rejected before any write commits, so re-run the sequence directly.
        await run();
      } else {
        throw err;
      }
    } finally {
      await session.endSession();
    }
  },
};
