import type { Item } from "~/schemas/item.js";

/**
 * Progressive exam assembly (§7, §9) — PURE.
 *
 * - Covers ONLY topics completed so far (the first exam covers topic 1; later
 *   exams are cumulative over all finished topics).
 * - Weighted toward weak TEKS: weak-topic items are preferred when filling each
 *   subject's quota, so weak standards get more coverage.
 * - Multi-subject sections sized by the configured split %, by item count AND
 *   time, with a configurable break between sections.
 * - No-repeat: never reuses an item already shown to the enrollment.
 */

export type ExamKind = "progressive" | "out_of_cycle" | "mock";

export type AssembleInput = {
  subjects: string[]; // ordered
  bankBySubject: Record<string, Item[]>;
  completedTopics: string[]; // standard codes finished so far
  weakTopics?: string[];
  usedIds?: Set<string>;
  splitPct: Record<string, number>; // across subjects, totals 100
  totalItems: number;
  durationSeconds: number;
  breakSeconds: number;
};

export type AssembledSection = { subject: string; itemIds: string[]; seconds: number };

export type AssembledExam = {
  sections: AssembledSection[];
  itemIds: string[]; // flat, in section order
  durationSeconds: number;
  breakSeconds: number;
  splitPct: Record<string, number>;
  coverage: string[]; // standard codes actually covered
};

/** Candidate items for a subject: cover only completed topics, not yet used. */
function candidatesFor(items: Item[], completed: Set<string>, used: Set<string>): Item[] {
  return items.filter(
    (it) => !used.has(it._id) && it.standardCodes.length > 0 && it.standardCodes.every((c) => completed.has(c)),
  );
}

function isWeak(it: Item, weak: Set<string>): boolean {
  return it.standardCodes.some((c) => weak.has(c));
}

/** First standard code, used to bucket an item by topic. */
function topicOf(it: Item): string {
  return it.standardCodes[0] ?? "";
}

/**
 * Select `count` items for a subject so the exam (a) covers EVERY finished topic
 * present (cumulative coverage — "covers all topics done so far"), then (b) fills
 * the remaining quota weighted toward weak TEKS (§9: more items for weak topics).
 */
function selectSubject(candidates: Item[], weak: Set<string>, count: number): Item[] {
  if (count <= 0) return [];
  // Bucket by topic, preserving first-seen order.
  const buckets = new Map<string, Item[]>();
  for (const it of candidates) {
    const t = topicOf(it);
    if (!buckets.has(t)) buckets.set(t, []);
    buckets.get(t)!.push(it);
  }

  const picked: Item[] = [];
  const taken = new Set<string>();

  // Pass 1 — coverage: one item from each topic, in order.
  for (const bucket of buckets.values()) {
    if (picked.length >= count) break;
    const it = bucket[0];
    if (it) {
      picked.push(it);
      taken.add(it._id);
    }
  }

  // Pass 2 — fill the rest weak-first, then remaining order.
  const leftovers = candidates.filter((it) => !taken.has(it._id));
  leftovers.sort((a, b) => Number(isWeak(b, weak)) - Number(isWeak(a, weak)));
  for (const it of leftovers) {
    if (picked.length >= count) break;
    picked.push(it);
  }

  return picked.slice(0, count);
}

/** Per-subject item quota from the split %, summing to totalItems (largest-remainder). */
function quotas(subjects: string[], splitPct: Record<string, number>, total: number): Record<string, number> {
  const raw = subjects.map((s) => ({ s, exact: (total * (splitPct[s] ?? 0)) / 100 }));
  const floored = raw.map((r) => ({ ...r, base: Math.floor(r.exact), frac: r.exact - Math.floor(r.exact) }));
  let assigned = floored.reduce((n, r) => n + r.base, 0);
  const out: Record<string, number> = {};
  for (const r of floored) out[r.s] = r.base;
  // Distribute the remainder to the largest fractional parts.
  const byFrac = [...floored].sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (assigned < total && byFrac.length > 0) {
    const key = byFrac[i % byFrac.length]!.s;
    out[key] = (out[key] ?? 0) + 1;
    assigned += 1;
    i += 1;
  }
  return out;
}

/**
 * Distribute `total` units across subjects by weight using largest-remainder, so
 * the parts always sum EXACTLY to `total`. Subjects with zero weight get zero.
 */
function distribute(subjects: string[], weight: Record<string, number>, total: number): Record<string, number> {
  const totalWeight = subjects.reduce((n, s) => n + (weight[s] ?? 0), 0);
  const out: Record<string, number> = {};
  for (const s of subjects) out[s] = 0;
  if (totalWeight <= 0 || total <= 0) return out;
  const rows = subjects.map((s) => {
    const exact = (total * (weight[s] ?? 0)) / totalWeight;
    return { s, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let assigned = 0;
  for (const r of rows) {
    out[r.s] = r.base;
    assigned += r.base;
  }
  const byFrac = [...rows].sort((a, b) => b.frac - a.frac);
  let i = 0;
  while (assigned < total && byFrac.length > 0) {
    const key = byFrac[i % byFrac.length]!.s;
    out[key] = (out[key] ?? 0) + 1;
    assigned += 1;
    i += 1;
  }
  return out;
}

export function assembleExam(input: AssembleInput): AssembledExam {
  const completed = new Set(input.completedTopics);
  const weak = new Set(input.weakTopics ?? []);
  const used = new Set(input.usedIds ?? []);

  // Candidate pool per subject (completed-topic, no-repeat) — drives availability.
  const candidates: Record<string, Item[]> = {};
  for (const subject of input.subjects) {
    candidates[subject] = candidatesFor(input.bankBySubject[subject] ?? [], completed, used);
  }

  // Base quotas from the split, then cap by availability and redistribute the
  // shortfall to subjects that still have spare candidates (§7).
  const want = quotas(input.subjects, input.splitPct, input.totalItems);
  const take: Record<string, number> = {};
  let shortfall = 0;
  for (const subject of input.subjects) {
    const avail = candidates[subject]!.length;
    const desired = want[subject] ?? 0;
    take[subject] = Math.min(desired, avail);
    shortfall += Math.max(0, desired - avail);
  }
  // Hand the shortfall to subjects with remaining capacity, in subject order.
  while (shortfall > 0) {
    let placed = false;
    for (const subject of input.subjects) {
      if (shortfall <= 0) break;
      if (take[subject]! < candidates[subject]!.length) {
        take[subject]! += 1;
        shortfall -= 1;
        placed = true;
      }
    }
    if (!placed) break; // no subject has spare candidates
  }

  const coverage = new Set<string>();
  const picked: Record<string, Item[]> = {};
  for (const subject of input.subjects) {
    const items = selectSubject(candidates[subject]!, weak, take[subject] ?? 0);
    picked[subject] = items;
    for (const it of items) for (const c of it.standardCodes) coverage.add(c);
  }

  // Seconds: split the FULL duration across POPULATED sections (so the section
  // times always reconcile to durationSeconds — §6/§8 "by time and item count").
  const secWeight: Record<string, number> = {};
  for (const subject of input.subjects) {
    secWeight[subject] = picked[subject]!.length > 0 ? (input.splitPct[subject] ?? 0) : 0;
  }
  const secs = distribute(input.subjects, secWeight, input.durationSeconds);

  const sections: AssembledSection[] = input.subjects.map((subject) => ({
    subject,
    itemIds: picked[subject]!.map((it) => it._id),
    seconds: secs[subject] ?? 0,
  }));

  return {
    sections,
    itemIds: sections.flatMap((s) => s.itemIds),
    durationSeconds: input.durationSeconds,
    breakSeconds: sections.filter((s) => s.itemIds.length > 0).length > 1 ? input.breakSeconds : 0,
    splitPct: input.splitPct,
    coverage: [...coverage],
  };
}
