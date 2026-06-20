import { z } from "zod";

/**
 * Billing & subscriptions (§12). A super_admin defines plans (price, interval,
 * features, included programs) and the demo/trial policy (length + which
 * programs it unlocks). An admin subscribes/pays; a parent can pay by card.
 *
 * We store ONLY Stripe references (`stripeCustomerId`, `stripeSubId`, payment-
 * intent / checkout ids) — never raw card data (§18). Out of the box the app
 * runs in demo mode (status "demo", no real charge); a real Stripe test key
 * switches it to live Checkout (see src/server/billing).
 */

export const billingIntervalSchema = z.enum(["month", "year"]);
export type BillingInterval = z.infer<typeof billingIntervalSchema>;

/** A pricing/subscription plan. `priceCents` is the MONTHLY base; yearly = ×10. */
export const planSchema = z.object({
  _id: z.string().optional(),
  /** Stable slug, e.g. "starter" | "family" | "pro". */
  id: z.string().min(1),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative(),
  /** Human feature bullets shown on the plan card. */
  features: z.array(z.string()).default([]),
  /** Program keys this plan unlocks. Empty = no programs (a placeholder plan). */
  programKeys: z.array(z.string()).default([]),
  /** Seat cap; null = unlimited. */
  maxStudents: z.number().int().positive().nullable().default(null),
  sortOrder: z.number().int().default(0),
  active: z.boolean().default(true),
});
export type Plan = z.infer<typeof planSchema>;

export const subscriptionStatusSchema = z.enum(["trialing", "active", "demo", "canceled", "past_due"]);
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;

export const subscriptionSchema = z.object({
  _id: z.string().optional(),
  /** The account the subscription belongs to (one active sub per account). */
  accountId: z.string().min(1),
  planId: z.string().nullable().default(null),
  interval: billingIntervalSchema.default("month"),
  status: subscriptionStatusSchema,
  /** Stripe references only — never card data. */
  stripeCustomerId: z.string().optional(),
  stripeSubId: z.string().optional(),
  currentPeriodEnd: z.date().nullable().default(null),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;

export const paymentStatusSchema = z.enum(["succeeded", "demo", "pending", "failed"]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  _id: z.string().optional(),
  accountId: z.string().min(1),
  /** Who initiated it (admin subscribe / parent invoice). */
  byUserId: z.string().min(1),
  amountCents: z.number().int().nonnegative(),
  currency: z.string().default("usd"),
  status: paymentStatusSchema,
  description: z.string().default(""),
  planId: z.string().nullable().default(null),
  interval: billingIntervalSchema.nullable().default(null),
  /** Stripe references only. */
  stripePaymentIntentId: z.string().optional(),
  stripeCheckoutId: z.string().optional(),
  createdAt: z.date(),
});
export type Payment = z.infer<typeof paymentSchema>;

/**
 * The global demo/trial policy (singleton, set by super_admin): how long the
 * free trial lasts and which programs it unlocks. `unlimited` removes the time
 * limit (programs are still gated by `programKeys`).
 */
export const DEMO_POLICY_ID = "demo-policy";
export const demoPolicySchema = z.object({
  _id: z.literal(DEMO_POLICY_ID).default(DEMO_POLICY_ID),
  lengthDays: z.number().int().positive().default(14),
  unlimited: z.boolean().default(false),
  programKeys: z.array(z.string()).default([]),
  updatedAt: z.date().optional(),
});
export type DemoPolicy = z.infer<typeof demoPolicySchema>;

export const DEMO_DAY_PRESETS = [7, 14, 30, 60] as const;
