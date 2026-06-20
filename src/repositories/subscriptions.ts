import { COLLECTIONS, getCollection } from "./db.js";
import type { Subscription } from "~/schemas/billing.js";

/** One subscription per account — keyed by accountId as the _id. */
type SubscriptionDoc = Subscription & { _id: string };

async function col() {
  return getCollection<SubscriptionDoc>(COLLECTIONS.subscriptions);
}

export const subscriptionsRepo = {
  async findByAccount(accountId: string): Promise<SubscriptionDoc | null> {
    return (await col()).findOne({ _id: accountId });
  },

  /** Create the account's trial row if it doesn't exist yet; returns it. */
  async ensureTrial(accountId: string): Promise<SubscriptionDoc> {
    const c = await col();
    const existing = await c.findOne({ _id: accountId });
    if (existing) return existing;
    const now = new Date();
    const doc: SubscriptionDoc = {
      _id: accountId,
      accountId,
      planId: null,
      interval: "month",
      status: "trialing",
      currentPeriodEnd: null,
      createdAt: now,
      updatedAt: now,
    };
    await c.updateOne({ _id: accountId }, { $setOnInsert: doc }, { upsert: true });
    return (await c.findOne({ _id: accountId }))!;
  },

  /** Replace the account's subscription state (subscribe / cancel). */
  async set(accountId: string, patch: Partial<Subscription>): Promise<void> {
    const c = await col();
    const now = new Date();
    await c.updateOne(
      { _id: accountId },
      { $set: { ...patch, accountId, updatedAt: now }, $setOnInsert: { _id: accountId, createdAt: now } },
      { upsert: true },
    );
  },
};
