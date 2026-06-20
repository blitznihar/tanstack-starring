import { randomUUID } from "node:crypto";
import { contentBundleSchema } from "~/schemas/contentBundle.js";
import { itemSchema, type Item } from "~/schemas/item.js";
import { passageSchema, type Passage } from "~/schemas/passage.js";
import { contentRepo } from "~/repositories/content.js";
import { passagesRepo } from "~/repositories/passages.js";
import { requireCapability } from "~/server/auth/rbac.js";
import type { AuthContext } from "~/server/auth/session.js";

export type ImportResult = {
  bundleId: string;
  programKey: string;
  subject: string;
  version: number;
  itemCount: number;
  passageCount: number;
  status: string;
};

/**
 * Single upload (§5). Accepts a full bundle JSON, validates with Zod, upserts by
 * (programKey, subject, version), and replaces the bundle's items. Adding a new
 * program/subject = importing a new bundle. Removing = setBundleStatus("archived").
 *
 * Pure validation/normalization is split out as `prepareBundle` so it can be
 * unit-tested without a database.
 */
export function prepareBundle(rawBundle: unknown): {
  bundleId: string;
  programKey: string;
  subject: string;
  version: number;
  status: string;
  title: string;
  items: Item[];
  passages: (Passage & { _id: string })[];
} {
  const bundle = contentBundleSchema.parse(rawBundle);
  const bundleId = `${bundle.programKey}:${bundle.subject}:v${bundle.version}`;

  const passages = bundle.passages.map((raw) => {
    const withDefaults = {
      ...raw,
      _id: raw._id ?? `${bundleId}:passage:${raw.id}`,
      bundleId,
      programKey: raw.programKey ?? bundle.programKey,
      subject: raw.subject ?? bundle.subject,
    };
    return passageSchema.parse(withDefaults) as Passage & { _id: string };
  });
  const passageIds = new Set(passages.map((p) => p.id));

  const items: Item[] = bundle.items.map((raw, idx) => {
    const withDefaults = {
      ...raw,
      _id: raw._id ?? `${bundleId}#${idx}`,
      bundleId,
      programKey: raw.programKey ?? bundle.programKey,
      subject: raw.subject ?? bundle.subject,
    };
    // Full item validation (catches malformed answer keys, missing standardCodes, etc.).
    const item = itemSchema.parse(withDefaults);
    // A passageRef must resolve to a passage in THIS bundle (catch authoring typos early).
    if (item.passageRef && !passageIds.has(item.passageRef)) {
      throw new Error(`Item ${item._id} references unknown passage "${item.passageRef}"`);
    }
    // inline_choice is option-based and KEY-scored (the UI commits the option key,
    // like every other option type). So each blank's correct value MUST be one of
    // the item's option keys — reject the "blank stores display text / wrong key"
    // authoring mistake at import instead of silently mis-scoring every student.
    // (text_entry has no options and stores literal text, so it is exempt.)
    if (item.type === "inline_choice" && item.blanks && item.options) {
      const keys = new Set(item.options.map((o) => o.key));
      for (const [blankId, value] of Object.entries(item.blanks)) {
        if (!keys.has(value)) {
          throw new Error(
            `Item ${item._id}: inline_choice blank "${blankId}" value "${value}" is not one of its option keys`,
          );
        }
      }
    }
    return item;
  });

  // Enforce unique item ids within the bundle.
  const ids = new Set<string>();
  for (const item of items) {
    if (ids.has(item._id)) throw new Error(`Duplicate item _id in bundle: ${item._id}`);
    ids.add(item._id);
  }

  return {
    bundleId,
    programKey: bundle.programKey,
    subject: bundle.subject,
    version: bundle.version,
    status: bundle.status,
    title: bundle.title,
    items,
    passages,
  };
}

export async function importBundle(actor: AuthContext, rawBundle: unknown): Promise<ImportResult> {
  requireCapability(actor.roles, "content.import");
  const prepared = prepareBundle(rawBundle);
  const parsed = contentBundleSchema.parse(rawBundle);

  // Standards first (so item references resolve in the browser).
  for (const std of parsed.standards) {
    await contentRepo.upsertStandard({ ...std, programKey: prepared.programKey });
  }

  const now = new Date();
  await contentRepo.upsertBundle({
    _id: prepared.bundleId,
    programKey: prepared.programKey,
    subject: prepared.subject,
    version: prepared.version,
    status: prepared.status as "draft" | "available" | "archived",
    title: prepared.title,
    itemCount: prepared.items.length,
    createdAt: now,
    updatedAt: now,
  });

  await contentRepo.replaceBundleItems(
    prepared.bundleId,
    prepared.items.map((i) => ({ ...i, _id: i._id ?? randomUUID() })),
  );

  // Passages (RLA): replace the bundle's set (§20.2).
  await passagesRepo.replaceBundlePassages(prepared.bundleId, prepared.passages);

  return {
    bundleId: prepared.bundleId,
    programKey: prepared.programKey,
    subject: prepared.subject,
    version: prepared.version,
    itemCount: prepared.items.length,
    passageCount: prepared.passages.length,
    status: prepared.status,
  };
}
