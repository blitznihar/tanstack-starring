/**
 * Seed the local database: programs, demo users (passwords printed once),
 * Maya's enrollments, and the Grade 3 Math content bundle.
 * Run: `bun run scripts/seed.ts` (requires MONGODB_URI reachable).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";
import { programsRepo } from "~/repositories/programs.js";
import { rewardRulesRepo } from "~/repositories/rewardRules.js";
import { plansRepo } from "~/repositories/plans.js";
import { billingConfigRepo } from "~/repositories/billingConfig.js";
import { subscriptionsRepo } from "~/repositories/subscriptions.js";
import { ACCOUNT_ID } from "~/server/billing/billing.js";
import { planSchema } from "~/schemas/billing.js";
import { programSchema } from "~/schemas/program.js";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { usersRepo } from "~/repositories/users.js";
import { closeDb } from "~/repositories/db.js";
import { generatePassword, hashPassword } from "~/server/auth/password.js";
import { importBundle } from "~/server/content/import.js";
import { seedPrograms, seedUsers } from "./seedData.js";
import type { AuthContext } from "~/server/auth/session.js";

const here = dirname(fileURLToPath(import.meta.url));

async function main() {
  console.log("Seeding programs…");
  for (const raw of seedPrograms) {
    const p = programSchema.parse(raw);
    await programsRepo.upsert(p);
    console.log(`  • ${p.key} (${p.subjects.join(", ")})`);
  }

  console.log("\nSeeding users (passwords shown once):");
  const created: Record<string, { id: string; password: string }> = {};
  for (const u of seedUsers) {
    const existing = await usersRepo.findByUsername(u.username);
    if (existing) {
      console.log(`  • ${u.username} — already exists, skipped`);
      created[u.username] = { id: existing._id!, password: "(unchanged)" };
      continue;
    }
    const password = generatePassword();
    const doc = await usersRepo.insert({
      _id: randomUUID(),
      username: u.username,
      displayName: u.displayName,
      roles: [...u.roles],
      passwordHash: await hashPassword(password),
      forceChangeOnFirstLogin: true,
      active: true,
    });
    created[u.username] = { id: doc._id!, password };
    console.log(`  • ${u.username.padEnd(12)} ${password}`);
  }

  console.log("\nEnrolling Maya (grade3_staar @ 45 days, sat @ 60 days)…");
  const mayaId = created.maya!.id;
  const today = new Date().toISOString().slice(0, 10);
  for (const programKey of ["grade3_staar", "sat"]) {
    const program = await programsRepo.findByKey(programKey);
    if (!program) continue;
    await enrollmentsRepo.upsert({
      _id: randomUUID(),
      studentId: mayaId,
      programKey,
      startDate: today,
      targetDays: program.targetDays,
      status: "active",
    });
    console.log(`  • ${programKey}`);
  }

  console.log("\nImporting Grade 3 Math bundle…");
  const systemActor: AuthContext = {
    userId: created.superadmin!.id,
    username: "superadmin",
    displayName: "Super Admin",
    roles: ["super_admin"],
    forceChangeOnFirstLogin: false,
  };
  const bundle = JSON.parse(readFileSync(join(here, "..", "content", "grade3_math.json"), "utf8"));
  const result = await importBundle(systemActor, bundle);
  console.log(`  • ${result.bundleId}: ${result.itemCount} items (${result.status})`);

  console.log("\nImporting Grade 3 RLA bundle (passages + full item-type range)…");
  const rlaBundle = JSON.parse(readFileSync(join(here, "..", "content", "grade3_rla.json"), "utf8"));
  const rlaResult = await importBundle(systemActor, rlaBundle);
  console.log(`  • ${rlaResult.bundleId}: ${rlaResult.itemCount} items, ${rlaResult.passageCount} passages (${rlaResult.status})`);

  console.log("\nSeeding reward rules…");
  const rewardSeeds = [
    { programKey: "grade3_staar", kind: "complete_in_days" as const, threshold: 45, prize: "Meta Quest 3 headset", status: "active" as const },
    { programKey: "grade3_staar", kind: "streak" as const, threshold: 20, prize: "Family trip to Chicago", status: "active" as const },
    { programKey: "grade3_staar", kind: "points" as const, threshold: 1000, prize: "New Lego set", status: "active" as const },
  ];
  for (const r of rewardSeeds) {
    const existing = (await rewardRulesRepo.list()).find((x) => x.programKey === r.programKey && x.prize === r.prize);
    if (!existing) await rewardRulesRepo.upsert(r);
    console.log(`  • ${r.prize} (${r.kind} ${r.threshold})`);
  }

  console.log("\nSeeding billing (plans + demo policy + trial)…");
  const allKeys = (await programsRepo.list()).map((p) => p.key);
  const planSeeds = [
    { id: "starter", name: "Starter", priceCents: 900, features: ["1 program", "Up to 2 students", "Email support"], programKeys: ["grade3_staar"], maxStudents: 2, sortOrder: 0, active: true },
    { id: "family", name: "Family", priceCents: 1900, features: ["Up to 3 programs", "Up to 4 students", "Progress reports", "Reward rules"], programKeys: allKeys.slice(0, 3), maxStudents: 4, sortOrder: 1, active: true },
    { id: "pro", name: "Pro", priceCents: 3900, features: ["All programs", "Unlimited students", "Priority support", "Custom programs"], programKeys: allKeys, maxStudents: null, sortOrder: 2, active: true },
  ];
  for (const p of planSeeds) {
    await plansRepo.upsert(planSchema.parse(p));
    console.log(`  • ${p.name} — $${p.priceCents / 100}/mo (${p.programKeys.length} programs)`);
  }
  await billingConfigRepo.setDemoPolicy({ lengthDays: 14, unlimited: false, programKeys: allKeys });
  await subscriptionsRepo.ensureTrial(ACCOUNT_ID);
  console.log(`  • demo policy: 14-day trial · ${allKeys.length} programs · account "${ACCOUNT_ID}" on free trial`);

  console.log("\nSeed complete.");
}

main()
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
