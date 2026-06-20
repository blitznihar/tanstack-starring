import { createServerFn } from "@tanstack/react-start";
import { enrollmentsRepo } from "~/repositories/enrollments.js";
import {
  walletView,
  rewardPanel,
  requestRedemption,
  listPendingRedemptions,
  approveRedemption,
  fulfillRedemption,
  getRobuxRules,
  setRobuxRules,
  listRewardRules,
  upsertRewardRule,
  createAdminRedemption,
  grantRobux,
} from "~/server/gamification/gamification.js";
import { requireAuth } from "./context.js";

async function firstActiveEnrollment(studentId: string) {
  const enrollments = await enrollmentsRepo.listForStudent(studentId);
  return enrollments.find((e) => e.status === "active") ?? enrollments[0] ?? null;
}

/** Student wallet + Big goals panel for the signed-in student's primary enrollment. */
export const myWallet = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  const enr = await firstActiveEnrollment(auth.userId);
  if (!enr?._id) return { available: false as const, displayName: auth.displayName };
  const [wallet, rewards] = await Promise.all([walletView(auth, enr._id), rewardPanel(auth, enr._id)]);
  return { available: true as const, displayName: auth.displayName, enrollmentId: enr._id, wallet, rewards };
});

export const requestRedeem = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; item: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    await requestRedemption(auth, data.enrollmentId, data.item, data.amount);
    return walletView(auth, data.enrollmentId);
  });

// ---- admin ----
export const adminRedemptions = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return listPendingRedemptions(auth);
});

export const adminApprove = createServerFn({ method: "POST" })
  .validator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    await approveRedemption(auth, data.id);
    return listPendingRedemptions(auth);
  });

export const adminFulfill = createServerFn({ method: "POST" })
  .validator((d: { id: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    await fulfillRedemption(auth, data.id, data.amount);
    return listPendingRedemptions(auth);
  });

export const adminCreateRedemption = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; item: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return createAdminRedemption(auth, data.enrollmentId, data.item, data.amount);
  });

export const adminGrantRobux = createServerFn({ method: "POST" })
  .validator((d: { enrollmentId: string; amount: number; reason?: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return grantRobux(auth, data.enrollmentId, data.amount, data.reason);
  });

export const robuxRules = createServerFn({ method: "GET" })
  .validator((d: { programKey: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return getRobuxRules(auth, data.programKey);
  });

export const saveRobuxRules = createServerFn({ method: "POST" })
  .validator((d: { programKey: string; rules: { practiceCorrect: number; examCorrect: number; examWrong: number; lessonComplete: number } }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return setRobuxRules(auth, data.programKey, data.rules);
  });

export const rewardRulesList = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return listRewardRules(auth);
});

export const saveRewardRule = createServerFn({ method: "POST" })
  .validator((d: { id?: string; programKey: string; studentId?: string; kind: "complete_in_days" | "streak" | "points"; threshold: number; prize: string; status: "active" | "fulfilled" | "archived" }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    await upsertRewardRule(auth, data);
    return listRewardRules(auth);
  });
