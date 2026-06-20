import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "~/lib/env.js";

/**
 * Stripe adapter (§12) — the ONLY place that talks to Stripe, via the REST API
 * over `fetch` (no SDK dependency, mirroring the DMR client). Used in TEST MODE
 * during development. We use Stripe-hosted **Checkout** so raw card data is
 * entered on Stripe's page and NEVER touches our server (§18). We persist only
 * the returned references (customer/checkout/subscription ids).
 *
 * When no real key is configured the app runs in demo mode and this module is
 * not called — see `billingMode()` in ./billing.ts.
 */

export class StripeError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "StripeError";
  }
}

export function stripeConfigured(): boolean {
  return env.stripe.enabled;
}

/** Stripe wants application/x-www-form-urlencoded with bracketed nested keys. */
function formEncode(params: Record<string, string | number | undefined>): string {
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) body.append(k, String(v));
  }
  return body.toString();
}

async function stripePost<T>(path: string, params: Record<string, string | number | undefined>): Promise<T> {
  if (!stripeConfigured()) throw new StripeError("Stripe is not configured (running in demo mode)");
  const url = `${env.stripe.baseUrl.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.stripe.secretKey}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formEncode(params),
    });
  } catch (err) {
    throw new StripeError(`Stripe request failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new StripeError(`Stripe returned HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export type CheckoutSession = { id: string; url: string };

/**
 * Create a hosted Checkout session for a subscription or one-off payment. The
 * caller redirects the browser to `url`; card entry happens on Stripe.
 */
export async function createCheckoutSession(input: {
  mode: "subscription" | "payment";
  amountCents: number;
  currency: string;
  productName: string;
  interval?: "month" | "year";
  successUrl: string;
  cancelUrl: string;
  clientReferenceId?: string;
}): Promise<CheckoutSession> {
  const params: Record<string, string | number | undefined> = {
    mode: input.mode,
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    client_reference_id: input.clientReferenceId,
    "line_items[0][quantity]": 1,
    "line_items[0][price_data][currency]": input.currency,
    "line_items[0][price_data][unit_amount]": input.amountCents,
    "line_items[0][price_data][product_data][name]": input.productName,
  };
  if (input.mode === "subscription" && input.interval) {
    params["line_items[0][price_data][recurring][interval]"] = input.interval;
  }
  const session = await stripePost<CheckoutSession>("/checkout/sessions", params);
  return { id: session.id, url: session.url };
}

export type StripeEvent = { type: string; data: { object: Record<string, unknown> } };

/**
 * Verify a Stripe webhook signature (the `Stripe-Signature` header) against the
 * raw request body using STRIPE_WEBHOOK_SECRET. Implements Stripe's scheme:
 * sign `${t}.${payload}` with HMAC-SHA256 and constant-time compare to the `v1`
 * signature, rejecting stale timestamps. Pure + dependency-free so it's testable.
 */
export function verifyStripeSignature(
  payload: string,
  sigHeader: string,
  secret: string,
  opts?: { toleranceSec?: number; nowSec?: number },
): boolean {
  if (!payload || !sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;

  const expected = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  const tolerance = opts?.toleranceSec ?? 300;
  const now = opts?.nowSec ?? Math.floor(Date.now() / 1000);
  return Math.abs(now - Number(t)) <= tolerance;
}

/** Parse a verified webhook body into an event (after verifyStripeSignature passes). */
export function parseStripeEvent(payload: string): StripeEvent {
  return JSON.parse(payload) as StripeEvent;
}
