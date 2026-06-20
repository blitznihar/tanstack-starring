import { contentRepo } from "~/repositories/content.js";
import { programsRepo } from "~/repositories/programs.js";
import { itemUsageRepo } from "~/repositories/itemUsage.js";
import { requireCapability } from "~/server/auth/rbac.js";
import {
  buildRefillPrompt,
  buildNewProgramPrompt,
  type RefillPoolDeficit,
  type NewProgramPromptInput,
} from "~/domain/promptgen/promptgen.js";
import { groupIntoPools, lowOrExhaustedPools, DEFAULT_THRESHOLDS, type PoolThresholds } from "~/domain/pools/pools.js";
import { richToText } from "~/lib/richText.js";
import type { AuthContext } from "~/server/auth/session.js";

/**
 * Server wrappers for the offline authoring-prompt generators. These read the
 * current pools/items from the DB and emit copy-paste text — no runtime LLM call.
 */

export async function generateRefillPrompt(
  actor: AuthContext,
  programKey: string,
  opts?: { subjects?: string[]; enrollmentId?: string; thresholds?: PoolThresholds },
): Promise<string> {
  requireCapability(actor.roles, "content.import");
  const program = await programsRepo.findByKey(programKey);
  if (!program) throw new Error(`Unknown program: ${programKey}`);
  const subjects = opts?.subjects ?? program.subjects;
  const thresholds = opts?.thresholds ?? DEFAULT_THRESHOLDS;

  const usedIds = opts?.enrollmentId
    ? await itemUsageRepo.usedItemIds(opts.enrollmentId)
    : new Set<string>();

  const deficits: RefillPoolDeficit[] = [];
  const existingStems = new Set<string>();

  for (const subject of subjects) {
    const items = await contentRepo.listItems({ programKey, subject });
    const standards = await contentRepo.listStandards(programKey, subject);
    const names = new Map(standards.map((s) => [s.code, s.description]));
    const pools = lowOrExhaustedPools(groupIntoPools(items, usedIds, { thresholds }));
    for (const pool of pools) {
      deficits.push({
        conceptName: names.get(pool.standardCode) ?? pool.standardCode,
        standardCode: pool.standardCode,
        need: pool.need,
        status: pool.status === "exhausted" ? "exhausted" : "running_low",
      });
    }
    // Existing stems to avoid duplicating — all items in the affected pools.
    const affected = new Set(pools.map((p) => p.standardCode));
    for (const item of items) {
      if (item.standardCodes.some((c) => affected.has(c))) {
        const stem = richToText(item.prompt);
        if (stem) existingStems.add(stem);
      }
    }
  }

  return buildRefillPrompt({
    programTitle: program.title,
    existingStems: [...existingStems],
    deficits,
  });
}

export async function generateNewProgramPrompt(
  actor: AuthContext,
  input: NewProgramPromptInput,
): Promise<string> {
  requireCapability(actor.roles, "content.import");
  return buildNewProgramPrompt(input);
}
