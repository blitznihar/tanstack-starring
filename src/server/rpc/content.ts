import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { listContentByProgram, viewBundleItems } from "~/server/content/browser.js";
import { importBundle } from "~/server/content/import.js";
import { importLessons } from "~/server/content/lessonImport.js";
import { poolStatuses } from "~/server/pools/pools.js";
import { generateLessonPrompt, generateNewProgramPrompt, generateRefillPrompt } from "~/server/content/promptgen.js";
import { requireAuth } from "./context.js";
import { richToText } from "~/lib/richText.js";

/** Content browser tree: programs → bundles ("View N items"). */
export const contentTree = createServerFn({ method: "GET" }).handler(async () => {
  const auth = await requireAuth();
  return listContentByProgram(auth);
});

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function extractContentBundles(programKey: string, raw: unknown): unknown[] {
  const payload = asObject(raw);
  const bundleCandidates = [
    ...asArray(payload.bundles),
    ...asArray(payload.contentBundles),
    ...asArray(payload.contents),
    ...asArray(payload.content),
    ...asArray(payload.bundle),
  ].filter((entry) => entry && typeof entry === "object");
  const bundles = bundleCandidates.length ? bundleCandidates : payload.items ? [payload] : [];
  return bundles.map((bundle, index) => {
    const obj = asObject(bundle);
    return {
      ...obj,
      programKey,
      subject: obj.subject ?? payload.subject ?? "math",
      version: obj.version ?? payload.version ?? index + 1,
      status: obj.status ?? payload.status ?? "available",
      title: obj.title ?? payload.title ?? `Uploaded Content ${index + 1}`,
    };
  });
}

/** Upload one or more content bundles for a specific program from JSON. */
export const uploadContentJson = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ programKey: z.string().min(1), json: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const parsed = JSON.parse(data.json) as unknown;
    const bundles = extractContentBundles(data.programKey, parsed);
    if (bundles.length === 0) throw new Error("No content bundles or items were found in the JSON file.");
    const results = [];
    for (const bundle of bundles) results.push(await importBundle(auth, bundle));
    return { tree: await listContentByProgram(auth), results };
  });

/** Upload one or more authored lessons for a specific program from JSON. */
export const uploadLessonJson = createServerFn({ method: "POST" })
  .validator((d: unknown) => z.object({ programKey: z.string().min(1), json: z.string().min(2) }).parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const parsed = JSON.parse(data.json) as unknown;
    const result = await importLessons(auth, data.programKey, parsed);
    return { tree: await listContentByProgram(auth), result };
  });

/** Items in a bundle (with usage counts) plus this (program,subject)'s pool status. */
export const bundleDetail = createServerFn({ method: "GET" })
  .validator((d: { bundleId: string; programKey: string; subject: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    const [items, pools] = await Promise.all([
      viewBundleItems(auth, data.bundleId),
      poolStatuses(auth, data.programKey, data.subject),
    ]);
    // Flatten prompts to text for compact display; keep options + rationale.
    const view = items.map((i) => ({
      _id: i._id,
      type: i.type,
      difficulty: i.difficulty,
      standardCodes: i.standardCodes,
      prompt: richToText(i.prompt),
      usageCount: i.usageCount,
      options: (i.options ?? []).map((o) => ({ key: o.key, text: o.text, correct: !!o.correct, rationale: o.rationale ?? "" })),
      explanation: richToText(i.explanation),
    }));
    return { items: view, pools };
  });

/** Generate the offline refill authoring prompt for a program's deficit pools. */
export const refillPrompt = createServerFn({ method: "POST" })
  .validator((d: { programKey: string; subjects?: string[] }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return generateRefillPrompt(auth, data.programKey, data.subjects ? { subjects: data.subjects } : undefined);
  });

/** Generate the offline lesson authoring prompt for a program/subject. */
export const lessonPrompt = createServerFn({ method: "POST" })
  .validator((d: { programKey: string; subject?: string }) => d)
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return generateLessonPrompt(auth, data.programKey, data.subject ? { subject: data.subject } : undefined);
  });

const newProgramPromptInput = z.object({
  programTitle: z.string().min(1),
  category: z.string().optional(),
  subjects: z.array(z.string().min(1)).min(1),
  targetDays: z.number().int().positive(),
  itemsPerSubject: z.number().int().positive().optional(),
});

/** Generate the offline authoring prompt for a brand-new program. */
export const newProgramPrompt = createServerFn({ method: "POST" })
  .validator((d: unknown) => newProgramPromptInput.parse(d))
  .handler(async ({ data }) => {
    const auth = await requireAuth();
    return generateNewProgramPrompt(auth, data);
  });
