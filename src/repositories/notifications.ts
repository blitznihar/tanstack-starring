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
  status: "queued" | "sent";
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
};
