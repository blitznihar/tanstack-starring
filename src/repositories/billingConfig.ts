import { COLLECTIONS, getCollection } from "./db.js";
import { DEMO_POLICY_ID, demoPolicySchema, type DemoPolicy } from "~/schemas/billing.js";

/** Singleton demo/trial policy (§12), set by super_admin. */
type DemoPolicyDoc = DemoPolicy & { _id: string };

async function col() {
  return getCollection<DemoPolicyDoc>(COLLECTIONS.billingConfig);
}

export const billingConfigRepo = {
  /** The demo policy, or schema defaults when none has been configured yet. */
  async getDemoPolicy(): Promise<DemoPolicy> {
    const doc = await (await col()).findOne({ _id: DEMO_POLICY_ID });
    if (!doc) return demoPolicySchema.parse({});
    return demoPolicySchema.parse(doc);
  },

  async setDemoPolicy(policy: Omit<DemoPolicy, "_id" | "updatedAt">): Promise<DemoPolicy> {
    const next = demoPolicySchema.parse({ ...policy, _id: DEMO_POLICY_ID, updatedAt: new Date() });
    await (await col()).updateOne({ _id: DEMO_POLICY_ID }, { $set: next }, { upsert: true });
    return next;
  },
};
