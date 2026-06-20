import { randomUUID } from "node:crypto";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import { programsRepo } from "~/repositories/programs.js";
import { usersRepo } from "~/repositories/users.js";
import { contentRepo } from "~/repositories/content.js";
import { robuxLedgerRepo } from "~/repositories/robuxLedger.js";
import { redemptionsRepo } from "~/repositories/redemptions.js";
import { rewardRulesRepo } from "~/repositories/rewardRules.js";
import { resolveFulfillment } from "~/domain/ledger/ledger.js";
import { evaluateRules, type RewardRule } from "~/domain/rewards/rewards.js";
import { robuxRulesSchema, type RobuxRules } from "~/schemas/program.js";
import { walletFor } from "./wallet.js";
import { toIso } from "~/lib/dates.js";
import { masterySummary } from "~/server/mastery/mastery.js";
import { getOrCreateSchedule } from "~/server/scheduler/scheduler.js";
import { requireCapability } from "~/server/auth/rbac.js";
import { queueStudentAndParentEmails } from "~/server/notifications/email.js";
import { visibleStudentsFor, userId } from "~/server/users/associations.js";
import type { AuthContext } from "~/server/auth/session.js";

function assertOwner(actor: AuthContext, enrollment: { studentId: string } | null): void {
  if (!enrollment) throw new Error("Enrollment not found");
  const isOwner = actor.userId === enrollment.studentId;
  const privileged = actor.roles.some((r) => r === "admin" || r === "super_admin" || r === "parent");
  if (!isOwner && !privileged) throw new Error("Forbidden: not your enrollment");
}

/** Standard redemption catalog — includes the "Roblox: 1,000 Robux" option (§20.6). */
export const REDEMPTION_CATALOG = [
  { item: "Extra screen time", cost: 300 },
  { item: "Pick the movie", cost: 200 },
  { item: "New Lego set", cost: 1000 },
  { item: "Roblox: 1,000 Robux", cost: 1000 },
  { item: "Stay up 30 min late", cost: 150 },
];

export async function walletView(actor: AuthContext, enrollmentId: string) {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  const wallet = await walletFor(enrollmentId);
  const entries = await robuxLedgerRepo.list(enrollmentId);
  const redemptions = await redemptionsRepo.list(enrollmentId);
  return {
    available: wallet.available,
    lifetime: wallet.lifetimeEarned,
    penalties: wallet.penalties,
    catalog: REDEMPTION_CATALOG,
    history: entries.map((e) => ({
      at: toIso(e.at),
      desc: `${e.type === "earn" ? "Earned" : e.type === "penalty" ? "Penalty" : "Redeemed"} · ${e.source}`,
      amount: e.type === "earn" ? e.amount : -e.amount,
    })),
    redemptions: redemptions.map((r) => ({ id: r._id, item: r.item, amountRequested: r.amountRequested, amountFulfilled: r.amountFulfilled, status: r.status })),
  };
}

export async function requestRedemption(actor: AuthContext, enrollmentId: string, item: string, amount: number) {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  const redemption = await redemptionsRepo.insert({
    enrollmentId,
    item,
    amountRequested: amount,
    amountFulfilled: 0,
    status: "requested",
    history: [{ at: new Date(), action: "requested", amount, by: actor.userId }],
  });
  await queueStudentAndParentEmails(enrollment!.studentId, {
    kind: "redemption_requested",
    subject: "Redemption request received",
    body: `We received the request for ${item}. The admin team is reviewing it and will cash the Robux into the account once approved.`,
  });
  return redemption;
}

export async function approveRedemption(actor: AuthContext, id: string) {
  requireCapability(actor.roles, "redemption.fulfill");
  const r = await redemptionsRepo.findById(id);
  if (!r) throw new Error("Redemption not found");
  await redemptionsRepo.update(id, { status: "approved", history: [...r.history, { at: new Date(), action: "approved", by: actor.userId }] });
  const enrollment = await enrollmentsRepo.findById(r.enrollmentId);
  if (enrollment) {
    await queueStudentAndParentEmails(enrollment.studentId, {
      kind: "redemption_approved",
      subject: "Redemption approved",
      body: `The request for ${r.item} has been approved. The admin team is working on fulfillment.`,
    });
  }
}

/** Mark fulfilled (supports partial). Books a negative ledger entry = the reset. */
export async function fulfillRedemption(actor: AuthContext, id: string, fulfillNow: number) {
  requireCapability(actor.roles, "redemption.fulfill");
  const r = await redemptionsRepo.findById(id);
  if (!r) throw new Error("Redemption not found");
  const wallet = await walletFor(r.enrollmentId);
  const res = resolveFulfillment({ amountRequested: r.amountRequested, alreadyFulfilled: r.amountFulfilled, available: wallet.available, fulfillNow });
  if (res.fulfilled > 0) {
    await robuxLedgerRepo.add({ enrollmentId: r.enrollmentId, type: "redeem_fulfilled", amount: res.fulfilled, source: "redemption", refId: `${id}:${r.amountFulfilled}` });
  }
  await redemptionsRepo.update(id, {
    amountFulfilled: res.totalFulfilled,
    status: res.complete ? "fulfilled" : "approved",
    history: [...r.history, { at: new Date(), action: res.complete ? "fulfilled" : "partial_fulfilled", amount: res.fulfilled, by: actor.userId }],
  });
  return res;
}

/** Pending redemptions across all students, with available balance, for admin fulfillment. */
export async function listPendingRedemptions(actor: AuthContext) {
  requireCapability(actor.roles, "redemption.fulfill");
  const docs = await redemptionsRepo.listAll(["requested", "approved"]);
  const visibleStudentIds = new Set((await visibleStudentsFor(actor)).map(userId));
  const out = [];
  for (const r of docs) {
    const [wallet, enrollment] = await Promise.all([walletFor(r.enrollmentId), enrollmentsRepo.findById(r.enrollmentId)]);
    if (enrollment && !visibleStudentIds.has(enrollment.studentId)) continue;
    const [student, program] = await Promise.all([
      enrollment ? usersRepo.findById(String(enrollment.studentId)) : null,
      enrollment ? programsRepo.findByKey(enrollment.programKey) : null,
    ]);
    out.push({
      id: r._id,
      enrollmentId: r.enrollmentId,
      studentName: student?.displayName ?? "Student",
      programTitle: program?.title ?? enrollment?.programKey ?? "",
      item: r.item,
      amountRequested: r.amountRequested,
      amountFulfilled: r.amountFulfilled,
      status: r.status,
      available: wallet.available,
    });
  }
  return out;
}

export async function createAdminRedemption(actor: AuthContext, enrollmentId: string, item: string, amount: number) {
  requireCapability(actor.roles, "redemption.fulfill");
  await requestRedemption(actor, enrollmentId, item, Math.max(1, Math.round(amount)));
  return listPendingRedemptions(actor);
}

export async function grantRobux(actor: AuthContext, enrollmentId: string, amount: number, reason = "admin adjustment") {
  requireCapability(actor.roles, "redemption.fulfill");
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  if (!enrollment) throw new Error("Enrollment not found");
  await robuxLedgerRepo.add({
    enrollmentId,
    type: "earn",
    amount: Math.max(1, Math.round(amount)),
    source: reason.trim() || "admin adjustment",
    refId: `admin-grant:${randomUUID()}`,
  });
  return listPendingRedemptions(actor);
}

async function rewardProgress(actor: AuthContext, enrollmentId: string, programKey: string) {
  const allTopics = [...new Set((await contentRepo.listItems({ programKey })).flatMap((i) => i.standardCodes))];
  const summary = await masterySummary(enrollmentId, allTopics);
  const wallet = await walletFor(enrollmentId);
  let streak = 0;
  let daysElapsed = 0;
  try {
    const s = await getOrCreateSchedule(actor, enrollmentId);
    streak = s.streak;
    daysElapsed = s.currentDay;
  } catch {
    /* schedule optional */
  }
  return {
    streak,
    daysElapsed,
    completed: allTopics.length > 0 && summary.remaining.length === 0,
    points: wallet.lifetimeEarned,
  };
}

/** "Big goals & rewards" panel for a student's enrollment (§20.6). */
export async function rewardPanel(actor: AuthContext, enrollmentId: string) {
  const enrollment = await enrollmentsRepo.findById(enrollmentId);
  assertOwner(actor, enrollment);
  const rules = await rewardRulesRepo.listForProgram(enrollment!.programKey, enrollment!.studentId);
  const progress = await rewardProgress(actor, enrollmentId, enrollment!.programKey);
  return evaluateRules(rules, progress).map((e) => ({ prize: e.rule.prize, kind: e.rule.kind, threshold: e.rule.threshold, met: e.met, progress: e.progress, label: e.label }));
}

// ---- admin config ----
export async function listRewardRules(actor: AuthContext): Promise<RewardRule[]> {
  requireCapability(actor.roles, "rewards.configure");
  return (await rewardRulesRepo.list()).map(publicRewardRule);
}
export async function upsertRewardRule(actor: AuthContext, rule: Omit<RewardRule, "id"> & { id?: string }) {
  requireCapability(actor.roles, "rewards.configure");
  const saved = await rewardRulesRepo.upsert(rule);
  const visibleStudents = await visibleStudentsFor(actor);
  const targetStudentIds = new Set<string>();
  if (rule.studentId) {
    if (visibleStudents.some((student) => userId(student) === rule.studentId)) targetStudentIds.add(rule.studentId);
  } else {
    for (const student of visibleStudents) {
      const id = userId(student);
      const enrollments = await enrollmentsRepo.listForStudent(id);
      if (enrollments.some((enrollment) => enrollment.programKey === rule.programKey && enrollment.status === "active")) targetStudentIds.add(id);
    }
  }
  await Promise.all(
    [...targetStudentIds].map((studentId) =>
      queueStudentAndParentEmails(studentId, {
        kind: "reward_rule_created",
        subject: "New reward rule added",
        body: `A new reward rule is available: ${rule.prize} for ${rule.kind.replace(/_/g, " ")} ${rule.threshold}.`,
      }),
    ),
  );
  return saved;
}

function publicRewardRule(rule: RewardRule): RewardRule {
  return {
    id: rule.id,
    programKey: rule.programKey,
    ...(rule.studentId ? { studentId: rule.studentId } : {}),
    kind: rule.kind,
    threshold: rule.threshold,
    prize: rule.prize,
    status: rule.status,
  };
}

export async function setRobuxRules(actor: AuthContext, programKey: string, rules: unknown): Promise<RobuxRules> {
  requireCapability(actor.roles, "robuxRules.configure");
  const parsed = robuxRulesSchema.parse(rules);
  await programsRepo.setRobuxRules(programKey, parsed);
  return parsed;
}

export async function getRobuxRules(actor: AuthContext, programKey: string): Promise<RobuxRules> {
  requireCapability(actor.roles, "robuxRules.configure");
  const program = await programsRepo.findByKey(programKey);
  if (!program) throw new Error("Program not found");
  return program.robuxRules;
}
