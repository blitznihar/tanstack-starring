/**
 * No-database demo of the M1 engines. Prints scoring, raw→scale→level conversion,
 * Robux ledger math, password/RBAC, and content-bundle validation so you can SEE
 * the foundation working in one command:
 *
 *   bun run scripts/demo.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { scoreItem } from "~/domain/scoring/score.js";
import { convert } from "~/domain/conversion/convert.js";
import { computeWallet, computeExamAward, resolveFulfillment } from "~/domain/ledger/ledger.js";
import { generatePassword } from "~/server/auth/password.js";
import { can } from "~/server/auth/rbac.js";
import { prepareBundle } from "~/server/content/import.js";
import { groupIntoPools, selectUnused } from "~/domain/pools/pools.js";
import { buildRefillPrompt } from "~/domain/promptgen/promptgen.js";
import type { Item } from "~/schemas/item.js";
import type { ConversionTable } from "~/schemas/program.js";

const line = (s = "") => console.log(s);
const h = (s: string) => line(`\n\x1b[1m\x1b[36m${s}\x1b[0m`);

const here = dirname(fileURLToPath(import.meta.url));

// ── 1. Deterministic scoring (with per-choice feedback + partial credit) ──────
h("1 · Deterministic scoring");
const mc: Item = {
  _id: "demo", bundleId: "b", programKey: "grade3_staar", subject: "math",
  standardCodes: ["3.2A"], type: "multiple_choice", difficulty: "easy",
  prompt: ["What is the value of the 7 in 4,732?"], figures: [], points: 1,
  allowPartialCredit: false,
  options: [
    { key: "A", text: "7", rationale: "ones place" },
    { key: "B", text: "70", rationale: "tens place" },
    { key: "C", text: "700", correct: true },
    { key: "D", text: "7,000", rationale: "thousands place" },
  ],
  explanation: ["The 7 is in the hundreds place → 7 × 100 = 700."],
  workedSolution: ["700"],
};
line(`  MC pick "C" → ${JSON.stringify(scoreItem(mc, "C"))}`);
line(`  MC pick "A" → ${JSON.stringify(scoreItem(mc, "A"))}  (feedback: "${mc.options![0]!.rationale}")`);

const ms: Item = { ...mc, type: "multiselect", points: 2, allowPartialCredit: true,
  options: [{ key: "A", text: "", correct: true }, { key: "B", text: "", correct: true }, { key: "C", text: "" }] };
line(`  Multiselect partial ["A"] of {A,B} → ${JSON.stringify(scoreItem(ms, ["A"]))}`);

// ── 2. Raw → scale → performance level ───────────────────────────────────────
h("2 · Raw → scale → performance level (cut points are configurable estimates)");
const table: ConversionTable = {
  subject: "math", year: 2024,
  rows: [
    { rawMin: 0, rawMax: 8, scale: 1100 }, { rawMin: 9, rawMax: 16, scale: 1350 },
    { rawMin: 17, rawMax: 24, scale: 1500 }, { rawMin: 25, rawMax: 32, scale: 1650 },
    { rawMin: 33, rawMax: 40, scale: 1800 },
  ],
  cutPoints: { approaches: 1350, meets: 1500, masters: 1700 },
};
for (const raw of [5, 12, 20, 30]) line(`  raw ${String(raw).padStart(2)} → ${JSON.stringify(convert(table, raw))}`);

// ── 3. Robux ledger (penalty + floor + partial fulfillment) ──────────────────
h("3 · Robux ledger math");
const wallet = computeWallet([
  { type: "earn", amount: 1000 }, { type: "earn", amount: 840 },
  { type: "penalty", amount: 30 }, { type: "redeem_fulfilled", amount: 300 },
]);
line(`  wallet → ${JSON.stringify(wallet)}`);
line(`  exam award 8 right / 2 wrong @ +20/-10, max 400 → ${JSON.stringify(computeExamAward({ correctCount: 8, wrongCount: 2, correctQuestionReward: 20, examMaxReward: 400, perWrongPenalty: 10 }))}`);
line(`  exam award 1 right / 10 wrong (floored at 0) → ${JSON.stringify(computeExamAward({ correctCount: 1, wrongCount: 10, correctQuestionReward: 20, examMaxReward: 400, perWrongPenalty: 10 }))}`);
line(`  partial fulfill 400 of 1000 → ${JSON.stringify(resolveFulfillment({ amountRequested: 1000, alreadyFulfilled: 0, available: 1000, fulfillNow: 400 }))}`);

// ── 4. Auth & RBAC ───────────────────────────────────────────────────────────
h("4 · Auth & RBAC");
line(`  generated password → ${generatePassword()}`);
line(`  admin can configure reward rules?      ${can(["admin"], "rewards.configure")}`);
line(`  admin can manage pricing?              ${can(["admin"], "pricing.manage")}  (super_admin only)`);
line(`  super_admin can manage pricing?        ${can(["super_admin"], "pricing.manage")}`);
line(`  student can request a redemption?      ${can(["student"], "redemption.request")}`);

// ── 5. Content bundle validation (single upload) ─────────────────────────────
h("5 · Content bundle (Grade 3 Math) single-upload validation");
const bundle = JSON.parse(readFileSync(join(here, "..", "content", "grade3_math.json"), "utf8"));
const prepared = prepareBundle(bundle);
const pools = new Map<string, number>();
for (const it of prepared.items) for (const code of it.standardCodes) pools.set(code, (pools.get(code) ?? 0) + 1);
line(`  bundle ${prepared.bundleId} → ${prepared.items.length} items, ${pools.size} pools`);
for (const [code, n] of pools) line(`    • ${code}: ${n} items`);

// ── 6. Item pools — no-repeat + ok/low/exhausted (M2) ────────────────────────
h("6 · Item pools — no-repeat depletion (M2)");
const allUsed = new Set<string>();
const pools0 = groupIntoPools(prepared.items, allUsed, { thresholds: { target: 30, lowThreshold: 2 } });
const p34k = pools0.find((p) => p.standardCode === "3.4K")!;
line(`  3.4K fresh → total=${p34k.total} unused=${p34k.unused} need=${p34k.need} [${p34k.status}]`);
// student uses every 3.4K item, then it's exhausted (no-repeat)
for (const it of prepared.items) if (it.standardCodes.includes("3.4K")) allUsed.add(it._id);
const p34kAfter = groupIntoPools(prepared.items, allUsed).find((p) => p.standardCode === "3.4K")!;
line(`  3.4K after student used all → unused=${p34kAfter.unused} [${p34kAfter.status}]`);
const next = selectUnused(prepared.items.filter((i) => i.standardCodes.includes("3.4K")), allUsed, 3);
line(`  no-repeat selection now returns ${next.length} items (none repeat)`);

// ── 7. Refill prompt generator — Appendix A (M2) ─────────────────────────────
h("7 · Refill-prompt generator — copy-paste authoring prompt (M2)");
const refill = buildRefillPrompt({
  programTitle: "Grade 3 STAAR",
  existingStems: ["A bag has 12 marbles shared equally into 3 cups. How many in each cup?"],
  deficits: [
    { conceptName: "Comparing numbers", standardCode: "3.2D", need: 8, status: "running_low" },
    { conceptName: "Multiplication & division word problems", standardCode: "3.4K", need: 12, status: "exhausted" },
  ],
});
for (const l of refill.split("\n").slice(0, 3)) line(`  ${l}`);
line("  …");
for (const l of refill.split("\n").filter((l) => l.startsWith("•"))) line(`  ${l}`);

line("\n\x1b[32mAll M1 + M2 engines ran. ✔\x1b[0m");
