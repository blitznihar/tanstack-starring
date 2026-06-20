import { z } from "zod";
import { itemSchema } from "./item.js";
import { passageSchema } from "./passage.js";

/** A standard/TEKS definition referenced by items. */
export const standardSchema = z.object({
  code: z.string().min(1),
  programKey: z.string().min(1),
  subject: z.string().min(1),
  reportingCategory: z.string().optional(),
  description: z.string().min(1),
});
export type Standard = z.infer<typeof standardSchema>;

export const bundleStatusSchema = z.enum(["draft", "available", "archived"]);
export type BundleStatus = z.infer<typeof bundleStatusSchema>;

/**
 * The single-upload payload. One import endpoint accepts a full bundle JSON,
 * validates with Zod, and upserts by (programKey, subject, version). Adding a new
 * program/subject = importing a new bundle; removing = status "archived".
 */
export const contentBundleSchema = z.object({
  programKey: z.string().min(1),
  subject: z.string().min(1),
  version: z.number().int().positive(),
  status: bundleStatusSchema.default("available"),
  title: z.string().min(1),
  standards: z.array(standardSchema).default([]),
  // RLA reading passages (§20.2). Optional — Math bundles carry none. _id/bundleId
  // assigned on import; programKey/subject defaulted from the bundle.
  passages: z
    .array(
      passageSchema.partial({ _id: true, bundleId: true }).extend({
        programKey: z.string().optional(),
        subject: z.string().optional(),
      }),
    )
    .default([]),
  // Items as authored: _id and bundleId may be omitted (assigned on import).
  items: z
    .array(
      itemSchema.partial({ _id: true, bundleId: true }).extend({
        programKey: z.string().optional(), // defaulted from bundle on import
        subject: z.string().optional(),
      }),
    )
    .min(1),
});
export type ContentBundleImport = z.infer<typeof contentBundleSchema>;

/** Persisted bundle metadata (items live in the items collection). */
export const bundleDocSchema = z.object({
  _id: z.string(),
  programKey: z.string(),
  subject: z.string(),
  version: z.number().int(),
  status: bundleStatusSchema,
  title: z.string(),
  itemCount: z.number().int().nonnegative(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type BundleDoc = z.infer<typeof bundleDocSchema>;
