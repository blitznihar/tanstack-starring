import type { BillingInterval } from "~/schemas/billing.js";

/**
 * Pure billing math (§12). `priceCents` on a plan is the MONTHLY base; a yearly
 * subscription bills 10× the monthly price — i.e. "2 months free", matching the
 * prototype's "Yearly · 2 mo free" toggle.
 */

const YEARLY_MONTHS_BILLED = 10;

export function priceForInterval(monthlyCents: number, interval: BillingInterval): number {
  return interval === "year" ? monthlyCents * YEARLY_MONTHS_BILLED : monthlyCents;
}

/** "$39" for whole dollars, "$39.50" otherwise. */
export function formatUsd(cents: number): string {
  const dollars = cents / 100;
  return cents % 100 === 0 ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

/** "$39/mo" or "$390/yr" for a plan's monthly base price at a given interval. */
export function priceLabel(monthlyCents: number, interval: BillingInterval): string {
  return `${formatUsd(priceForInterval(monthlyCents, interval))}${interval === "year" ? "/yr" : "/mo"}`;
}
