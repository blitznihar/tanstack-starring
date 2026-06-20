import { randomUUID } from "node:crypto";
import { COLLECTIONS, getCollection } from "./db.js";
import type { Payment } from "~/schemas/billing.js";

type PaymentDoc = Payment & { _id: string };

async function col() {
  const c = await getCollection<PaymentDoc>(COLLECTIONS.payments);
  await c.createIndex({ accountId: 1, createdAt: -1 });
  return c;
}

export const paymentsRepo = {
  async insert(payment: Payment): Promise<PaymentDoc> {
    const doc: PaymentDoc = { ...payment, _id: payment._id ?? randomUUID() };
    await (await col()).insertOne(doc);
    return doc;
  },

  async listByAccount(accountId: string, limit = 50): Promise<PaymentDoc[]> {
    return (await col()).find({ accountId }).sort({ createdAt: -1 }).limit(limit).toArray();
  },

  async findByCheckoutId(stripeCheckoutId: string): Promise<PaymentDoc | null> {
    return (await col()).findOne({ stripeCheckoutId });
  },

  async update(id: string, patch: Partial<Payment>): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: patch });
  },
};
