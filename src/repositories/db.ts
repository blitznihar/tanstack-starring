import { MongoClient, type Db, type Collection, type Document } from "mongodb";
import { env } from "~/lib/env.js";

/**
 * Single Mongo connection, env-configured. Switching local Docker → Atlas is a
 * change to MONGODB_URI only — no code changes. All collection access goes
 * through the repository layer (one module per collection); nothing else imports
 * the driver directly.
 */

let clientPromise: Promise<MongoClient> | null = null;

function dbNameFromUri(uri: string): string {
  try {
    const afterHost = uri.split("/").slice(3).join("/");
    const name = afterHost.split("?")[0];
    return name && name.length > 0 ? name : "comet";
  } catch {
    return "comet";
  }
}

export async function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    const client = new MongoClient(env.mongodbUri);
    clientPromise = client.connect();
  }
  return clientPromise;
}

export async function getDb(): Promise<Db> {
  const client = await getClient();
  return client.db(dbNameFromUri(env.mongodbUri));
}

export async function getCollection<T extends Document = Document>(
  name: string,
): Promise<Collection<T>> {
  const db = await getDb();
  return db.collection<T>(name);
}

export async function closeDb(): Promise<void> {
  if (clientPromise) {
    const client = await clientPromise;
    await client.close();
    clientPromise = null;
  }
}

/** Collection names — centralized so they never drift between repositories. */
export const COLLECTIONS = {
  users: "users",
  programs: "programs",
  enrollments: "enrollments",
  standards: "standards",
  bundles: "bundles",
  lessons: "lessons",
  passages: "passages",
  items: "items",
  itemUsage: "itemUsage",
  exams: "exams",
  examSessions: "examSessions",
  responses: "responses",
  masteryStates: "masteryStates",
  robuxLedger: "robuxLedger",
  redemptions: "redemptions",
  rewardRules: "rewardRules",
  plans: "plans",
  subscriptions: "subscriptions",
  payments: "payments",
  billingConfig: "billingConfig",
  schedules: "schedules",
  sessions: "sessions",
  scoringJobs: "scoringJobs",
} as const;
