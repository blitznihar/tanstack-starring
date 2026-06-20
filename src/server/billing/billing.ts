import { plansRepo } from "~/repositories/plans.js";
import { subscriptionsRepo } from "~/repositories/subscriptions.js";
import { paymentsRepo } from "~/repositories/payments.js";
import { billingConfigRepo } from "~/repositories/billingConfig.js";
import { programsRepo } from "~/repositories/programs.js";
import { can, requireCapability, ForbiddenError } from "~/server/auth/rbac.js";
import { env } from "~/lib/env.js";
import { priceForInterval, priceLabel } from "~/domain/billing/pricing.js";
import { programAccess } from "~/domain/billing/access.js";
import { createCheckoutSession, stripeConfigured, verifyStripeSignature, parseStripeEvent } from "./stripe.js";
import { toIso } from "~/lib/dates.js";
import type { AuthContext } from "~/server/auth/session.js";
import type { BillingInterval, Plan, Subscription } from "~/schemas/billing.js";

/**
 * Billing service (§12). The app is single-account for now; every admin/parent
 * action operates on the one account below. Demo mode (default) records demo
 * subscriptions/payments with NO real charge; a real Stripe test key switches to
 * hosted Checkout. NO card data is ever accepted server-side (§18) — in demo
 * mode the card form is client-only; in Stripe mode card entry is on Stripe.
 */

export const ACCOUNT_ID = "default";

export function billingMode(): "stripe" | "demo" {
  return stripeConfigured() ? "stripe" : "demo";
}

/** A parent (`payment.make`) or an admin (`billing.subscribe`) may pay. */
function requireBillingActor(actor: AuthContext): void {
  if (!can(actor.roles, "payment.make") && !can(actor.roles, "billing.subscribe")) {
    throw new ForbiddenError("payment.make");
  }
}

/** Billing is scoped to super_admin/admin/parent (§12) — students must not read it. */
function requireBillingView(actor: AuthContext): void {
  if (!can(actor.roles, "billing.subscribe") && !can(actor.roles, "payment.make") && !can(actor.roles, "pricing.manage")) {
    throw new ForbiddenError("billing.subscribe");
  }
}

/** Load the account's subscription + demo policy + programs and compute access (§12). */
async function computeAccess() {
  const [subscription, demoPolicy, programs] = await Promise.all([
    subscriptionsRepo.ensureTrial(ACCOUNT_ID),
    billingConfigRepo.getDemoPolicy(),
    programsRepo.list(),
  ]);
  const plan = subscription.planId ? await plansRepo.findById(subscription.planId) : null;
  const access = programAccess({
    now: new Date(),
    allProgramKeys: programs.map((p) => p.key),
    demoPolicy,
    trialStartedAt: subscription.createdAt,
    subscription,
    plan,
  });
  return { subscription, demoPolicy, programs, plan, access };
}

/** The set of program keys currently unlocked for the account (subscription ∪ active demo). */
export async function accountUnlockedPrograms(): Promise<Set<string>> {
  const { access } = await computeAccess();
  return new Set(access.unlockedProgramKeys);
}

export async function isProgramUnlocked(programKey: string): Promise<boolean> {
  return (await accountUnlockedPrograms()).has(programKey);
}

/** Server-side entitlement gate (§12) — throws if a program isn't unlocked by subscription/demo. */
export async function assertProgramUnlocked(programKey: string): Promise<void> {
  if (!(await isProgramUnlocked(programKey))) {
    throw new Error(`Program "${programKey}" is locked — an active subscription or trial is required.`);
  }
}

function pricedPlan(plan: Plan) {
  return {
    id: plan.id,
    name: plan.name,
    priceCents: plan.priceCents,
    features: plan.features,
    programKeys: plan.programKeys,
    maxStudents: plan.maxStudents,
    monthlyCents: priceForInterval(plan.priceCents, "month"),
    yearlyCents: priceForInterval(plan.priceCents, "year"),
    monthlyLabel: priceLabel(plan.priceCents, "month"),
    yearlyLabel: priceLabel(plan.priceCents, "year"),
  };
}

export type BillingOverview = Awaited<ReturnType<typeof getOverview>>;

export async function getOverview(actor: AuthContext) {
  requireBillingView(actor);
  const [plans, ctx] = await Promise.all([plansRepo.list(), computeAccess()]);
  const { subscription, demoPolicy, programs, plan, access } = ctx;

  const programTitleByKey = Object.fromEntries(programs.map((p) => [p.key, p.title]));

  return {
    mode: billingMode(),
    isSuper: actor.roles.includes("super_admin"),
    canManage: can(actor.roles, "billing.subscribe"),
    canManagePricing: can(actor.roles, "pricing.manage"),
    canConfigureDemo: can(actor.roles, "demo.configure"),
    canPay: can(actor.roles, "payment.make") || can(actor.roles, "billing.subscribe"),
    plans: plans.map(pricedPlan),
    currentPlanId: subscription.planId,
    currentPlanName: plan?.name ?? null,
    subscriptionStatus: subscription.status,
    interval: subscription.interval,
    demoPolicy: { lengthDays: demoPolicy.lengthDays, unlimited: demoPolicy.unlimited, programKeys: demoPolicy.programKeys },
    access,
    programs: programs.map((p) => ({ key: p.key, title: p.title })),
    programTitleByKey,
    recentPayments: (await paymentsRepo.listByAccount(ACCOUNT_ID, 10)).map((p) => ({
      amountCents: p.amountCents,
      status: p.status,
      description: p.description,
      createdAt: toIso(p.createdAt) ?? "",
    })),
  };
}

export async function setPlanPrice(actor: AuthContext, input: { planId: string; priceCents: number }) {
  requireCapability(actor.roles, "pricing.manage");
  if (!Number.isFinite(input.priceCents) || input.priceCents < 0) throw new Error("Price must be a non-negative number");
  const plan = await plansRepo.findById(input.planId);
  if (!plan) throw new Error("Plan not found");
  await plansRepo.setPrice(input.planId, Math.round(input.priceCents));
  return getOverview(actor);
}

export async function setDemoPolicy(
  actor: AuthContext,
  input: { lengthDays: number; unlimited: boolean; programKeys: string[] },
) {
  requireCapability(actor.roles, "demo.configure");
  await billingConfigRepo.setDemoPolicy({
    lengthDays: Math.max(1, Math.round(input.lengthDays)),
    unlimited: input.unlimited,
    programKeys: input.programKeys,
  });
  return getOverview(actor);
}

function periodEnd(now: Date, interval: BillingInterval): Date {
  const d = new Date(now);
  if (interval === "year") d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d;
}

export type SubscribeResult = {
  ok: boolean;
  mode: "stripe" | "demo";
  checkoutUrl: string | null;
  status: Subscription["status"];
  message: string;
};

/** Admin subscribes to a plan. Demo mode activates immediately (no charge); Stripe mode returns a Checkout URL. */
export async function subscribe(actor: AuthContext, input: { planId: string; interval: BillingInterval }): Promise<SubscribeResult> {
  requireCapability(actor.roles, "billing.subscribe");
  const plan = await plansRepo.findById(input.planId);
  if (!plan) throw new Error("Plan not found");
  const amountCents = priceForInterval(plan.priceCents, input.interval);

  if (billingMode() === "stripe") {
    const session = await createCheckoutSession({
      mode: "subscription",
      amountCents,
      currency: "usd",
      productName: `${plan.name} plan`,
      interval: input.interval,
      successUrl: `${env.apiBaseUrl}/billing?checkout=success`,
      cancelUrl: `${env.apiBaseUrl}/billing?checkout=cancel`,
      clientReferenceId: ACCOUNT_ID,
    });
    // Persist the Stripe reference now (§12: store only Stripe references). The
    // subscription is activated later by the verified webhook (handleStripeWebhook).
    await paymentsRepo.insert({
      accountId: ACCOUNT_ID,
      byUserId: actor.userId,
      amountCents,
      currency: "usd",
      status: "pending",
      description: `${plan.name} plan (${input.interval === "year" ? "yearly" : "monthly"}) — awaiting Stripe`,
      planId: plan.id,
      interval: input.interval,
      stripeCheckoutId: session.id,
      createdAt: new Date(),
    });
    return { ok: true, mode: "stripe", checkoutUrl: session.url, status: "trialing", message: "Redirecting to secure checkout…" };
  }

  // Demo: activate now, record a demo payment (no real charge).
  const now = new Date();
  await subscriptionsRepo.set(ACCOUNT_ID, {
    planId: plan.id,
    interval: input.interval,
    status: "demo",
    currentPeriodEnd: periodEnd(now, input.interval),
  });
  await paymentsRepo.insert({
    accountId: ACCOUNT_ID,
    byUserId: actor.userId,
    amountCents,
    currency: "usd",
    status: "demo",
    description: `${plan.name} plan (${input.interval === "year" ? "yearly" : "monthly"}) — demo`,
    planId: plan.id,
    interval: input.interval,
    createdAt: now,
  });
  return { ok: true, mode: "demo", checkoutUrl: null, status: "demo", message: `Subscribed to ${plan.name} (demo — no real charge).` };
}

export type PayResult = { ok: boolean; mode: "stripe" | "demo"; checkoutUrl: string | null; message: string };

/** A one-off card payment (parent invoice / admin). Demo records it; Stripe returns a Checkout URL. */
export async function payInvoice(actor: AuthContext, input: { amountCents: number; description: string }): Promise<PayResult> {
  requireBillingActor(actor);
  if (!Number.isFinite(input.amountCents) || input.amountCents <= 0) throw new Error("Amount must be a positive number");
  const amountCents = Math.round(input.amountCents);

  if (billingMode() === "stripe") {
    const session = await createCheckoutSession({
      mode: "payment",
      amountCents,
      currency: "usd",
      productName: input.description || "Comet invoice",
      successUrl: `${env.apiBaseUrl}/billing?checkout=success`,
      cancelUrl: `${env.apiBaseUrl}/billing?checkout=cancel`,
      clientReferenceId: ACCOUNT_ID,
    });
    await paymentsRepo.insert({
      accountId: ACCOUNT_ID,
      byUserId: actor.userId,
      amountCents,
      currency: "usd",
      status: "pending",
      description: input.description || "Invoice",
      planId: null,
      interval: null,
      stripeCheckoutId: session.id,
      createdAt: new Date(),
    });
    return { ok: true, mode: "stripe", checkoutUrl: session.url, message: "Redirecting to secure checkout…" };
  }

  await paymentsRepo.insert({
    accountId: ACCOUNT_ID,
    byUserId: actor.userId,
    amountCents,
    currency: "usd",
    status: "demo",
    description: input.description || "Invoice — demo",
    planId: null,
    interval: null,
    createdAt: new Date(),
  });
  return { ok: true, mode: "demo", checkoutUrl: null, message: "Payment recorded (demo — no real charge)." };
}

/**
 * Reconcile a completed Stripe Checkout (called from the verified webhook): mark
 * the pending payment succeeded, store the Stripe references, and — for a
 * subscription checkout — activate the subscription. Idempotent: a payment
 * already marked succeeded is left as-is.
 */
export async function applyCheckoutCompleted(input: {
  checkoutId: string;
  customerId?: string;
  subscriptionId?: string;
}): Promise<{ applied: boolean }> {
  const payment = await paymentsRepo.findByCheckoutId(input.checkoutId);
  if (!payment || payment.status === "succeeded") return { applied: false };

  await paymentsRepo.update(payment._id, {
    status: "succeeded",
    ...(input.subscriptionId ? { stripePaymentIntentId: input.subscriptionId } : {}),
  });

  if (payment.planId) {
    const now = new Date();
    const interval = payment.interval ?? "month";
    await subscriptionsRepo.set(ACCOUNT_ID, {
      planId: payment.planId,
      interval,
      status: "active",
      stripeCustomerId: input.customerId,
      stripeSubId: input.subscriptionId,
      currentPeriodEnd: periodEnd(now, interval),
    });
  }
  return { applied: true };
}

/**
 * Stripe webhook entry point. Verify the signature against STRIPE_WEBHOOK_SECRET,
 * then reconcile checkout.session.completed. Wire this to a POST route that passes
 * the RAW request body + the `Stripe-Signature` header (see electron/README and
 * the project README — the real-Stripe webhook is the one operator step beyond the
 * fully-functional demo mode).
 */
export async function handleStripeWebhook(rawBody: string, signature: string): Promise<{ handled: boolean; type?: string }> {
  if (!verifyStripeSignature(rawBody, signature, env.stripe.webhookSecret)) {
    throw new Error("Invalid Stripe webhook signature");
  }
  const event = parseStripeEvent(rawBody);
  if (event.type === "checkout.session.completed") {
    const obj = event.data.object as { id?: string; customer?: unknown; subscription?: unknown };
    if (obj.id) {
      await applyCheckoutCompleted({
        checkoutId: obj.id,
        customerId: typeof obj.customer === "string" ? obj.customer : undefined,
        subscriptionId: typeof obj.subscription === "string" ? obj.subscription : undefined,
      });
    }
    return { handled: true, type: event.type };
  }
  return { handled: false, type: event.type };
}
