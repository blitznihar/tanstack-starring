import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getOverview, setPlanPrice, setDemoPolicy, subscribe, payInvoice } from "~/server/billing/billing.js";
import { billingIntervalSchema } from "~/schemas/billing.js";
import { requireAuth } from "./context.js";

/** Plans, current subscription, demo policy, and per-program access (§12). */
export const billingOverview = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return getOverview(auth);
});

const planPriceInput = z.object({ planId: z.string().min(1), priceCents: z.number().int().nonnegative() });
export const savePlanPrice = createServerFn({ method: "POST" })
  .validator((d: unknown) => planPriceInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return setPlanPrice(auth, data);
  });

const demoPolicyInput = z.object({
  lengthDays: z.number().int().positive(),
  unlimited: z.boolean(),
  programKeys: z.array(z.string()),
});
export const saveDemoPolicy = createServerFn({ method: "POST" })
  .validator((d: unknown) => demoPolicyInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return setDemoPolicy(auth, data);
  });

const subscribeInput = z.object({ planId: z.string().min(1), interval: billingIntervalSchema });
export const subscribePlan = createServerFn({ method: "POST" })
  .validator((d: unknown) => subscribeInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return subscribe(auth, data);
  });

// NB: no card fields here by design — demo card entry is client-only; real Stripe
// collects the card on its hosted Checkout page. The server never sees a PAN (§18).
const payInput = z.object({ amountCents: z.number().int().positive(), description: z.string().default("") });
export const payInvoiceFn = createServerFn({ method: "POST" })
  .validator((d: unknown) => payInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return payInvoice(auth, data);
  });
