import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";

export type NotificationKind =
  | "redemption_requested"
  | "redemption_approved"
  | "reward_rule_created"
  | "practice_report"
  | "exam_report"
  | "password_reset"
  | "email_confirmation";
export type NotificationDoc = {
  _id: string;
  userId: string;
  recipientEmail?: string;
  channel: "email";
  kind: NotificationKind;
  subject: string;
  body: string;
  status: "queued" | "sent" | "failed";
  sentAt?: Date;
  lastError?: string;
  createdAt: Date;
  updatedAt: Date;
};

async function col() {
  const c = await getCollection<NotificationDoc>(COLLECTIONS.notifications);
  await c.createIndex({ userId: 1, createdAt: -1 });
  return c;
}

export const notificationsRepo = {
  async queue(doc: Omit<NotificationDoc, "_id" | "channel" | "status" | "createdAt" | "updatedAt">): Promise<NotificationDoc> {
    const now = new Date();
    const full: NotificationDoc = {
      ...doc,
      _id: randomUUID(),
      channel: "email",
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    await (await col()).insertOne(full);
    return full;
  },

  async listForUser(userId: string): Promise<NotificationDoc[]> {
    return (await col()).find({ userId }).sort({ createdAt: -1 }).toArray();
  },

  async listQueued(limit = 50): Promise<NotificationDoc[]> {
    return (await col()).find({ status: "queued" }).sort({ createdAt: 1 }).limit(limit).toArray();
  },

  async markSent(id: string): Promise<void> {
    const now = new Date();
    await (await col()).updateOne({ _id: id }, { $set: { status: "sent", sentAt: now, updatedAt: now }, $unset: { lastError: "" } });
  },

  async markFailed(id: string, error: string): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { status: "failed", lastError: error.slice(0, 1000), updatedAt: new Date() } });
  },
};
