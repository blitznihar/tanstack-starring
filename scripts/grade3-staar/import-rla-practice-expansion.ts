import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient, type AnyBulkWriteOperation, type ClientSession, type Db } from "mongodb";
import { contentBundleSchema } from "~/schemas/contentBundle.js";
import type { Item } from "~/schemas/item.js";
import { env } from "~/lib/env.js";

const PROGRAM_KEY = "grade3_staar";
const SUBJECT = "rla";
const VERSION = 20260624;
const BUNDLE_ID = `${PROGRAM_KEY}:${SUBJECT}:v${VERSION}`;
const INPUT_FILE = join(dirname(fileURLToPath(import.meta.url)), "../../content/grade3_staar_rla_practice_expansion.json");
const DB_NAMES = ["comet", "comet-dev"] as const;
const TARGET_STANDARDS = [
  "3.10A",
  "3.10D",
  "3.3B",
  "3.6F",
  "3.6G",
  "3.7C",
  "3.7D",
  "3.8B",
  "3.8C",
  "3.9D",
] as const;

type StandardCode = (typeof TARGET_STANDARDS)[number];
type StringIdDoc = { _id: string } & Record<string, unknown>;

function textOfRich(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value.map((node) => (typeof node === "string" ? node : node && typeof node === "object" ? String((node as { text?: unknown }).text ?? "") : "")).join(" ");
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function tokens(text: string): Set<string> {
  return new Set(normalize(text).split(" ").filter((token) => token.length > 2));
}

function jaccard(a: string, b: string): number {
  const left = tokens(a);
  const right = tokens(b);
  if (left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function isTransactionUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /transaction numbers|replica set|TransactionNotSupported|not supported/i.test(message);
}

async function withTransactionFallback<T>(
  client: MongoClient,
  dbName: string,
  operation: (session?: ClientSession) => Promise<T>,
): Promise<{ result: T; mode: "transaction" | "non-transactional fallback" }> {
  const session = client.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await operation(session);
    });
    if (result === undefined) throw new Error(`No result returned while writing ${dbName}`);
    return { result, mode: "transaction" };
  } catch (error) {
    if (!isTransactionUnsupported(error)) throw error;
    const result = await operation(undefined);
    return { result, mode: "non-transactional fallback" };
  } finally {
    await session.endSession();
  }
}

function generatedCounts(items: Item[]): Record<StandardCode, number> {
  return Object.fromEntries(TARGET_STANDARDS.map((code) => [
    code,
    items.filter((item) => item.standardCodes.includes(code)).length,
  ])) as Record<StandardCode, number>;
}

function validateGeneratedBundle(bundle: ReturnType<typeof contentBundleSchema.parse>): void {
  if (bundle.programKey !== PROGRAM_KEY || bundle.subject !== SUBJECT || bundle.version !== VERSION) {
    throw new Error(`Unexpected bundle identity: ${bundle.programKey}/${bundle.subject}/v${bundle.version}`);
  }
  const counts = generatedCounts(bundle.items as Item[]);
  for (const code of TARGET_STANDARDS) {
    if (counts[code] !== 150) throw new Error(`Generated bundle has ${counts[code]} items for ${code}; expected 150`);
  }
  if (bundle.items.some((item) => item.standardCodes.includes("31.0D"))) {
    throw new Error("Generated bundle contains invalid orphan standard code 31.0D");
  }
}

async function verifyStandards(db: Db, session?: ClientSession): Promise<void> {
  const standards = await db.collection("standards").find(
    { programKey: PROGRAM_KEY, subject: SUBJECT, code: { $in: [...TARGET_STANDARDS] } },
    { session },
  ).project({ code: 1 }).toArray();
  const found = new Set(standards.map((standard) => standard.code));
  const missing = TARGET_STANDARDS.filter((code) => !found.has(code));
  if (missing.length > 0) throw new Error(`${db.databaseName}: missing required standards: ${missing.join(", ")}`);

  const invalidCount = await db.collection("standards").countDocuments(
    { programKey: PROGRAM_KEY, subject: SUBJECT, code: "31.0D" },
    { session },
  );
  if (invalidCount > 0) throw new Error(`${db.databaseName}: invalid standard 31.0D already exists; refusing to continue`);
}

function exactDuplicateKeys(items: Item[]): { prompts: Map<string, string>; passageQuestions: Map<string, string>; answerSetsByStandard: Map<string, Map<string, string>> } {
  const prompts = new Map<string, string>();
  const passageQuestions = new Map<string, string>();
  const answerSetsByStandard = new Map<string, Map<string, string>>();
  for (const item of items) {
    const standard = item.standardCodes[0] ?? "";
    const prompt = normalize(textOfRich(item.prompt));
    prompts.set(prompt, item._id);
    passageQuestions.set(normalize(`${item.passageRef ?? ""} ${textOfRich(item.prompt)}`), item._id);
    const answerSet = normalize((item.options ?? []).map((option) => option.text).sort().join("|"));
    const byStandard = answerSetsByStandard.get(standard) ?? new Map<string, string>();
    byStandard.set(answerSet, item._id);
    answerSetsByStandard.set(standard, byStandard);
  }
  return { prompts, passageQuestions, answerSetsByStandard };
}

async function duplicateReport(
  db: Db,
  generatedItems: Item[],
  session?: ClientSession,
): Promise<{ skippedIds: Set<string>; counts: Record<StandardCode, number> }> {
  const generatedIds = new Set(generatedItems.map((item) => item._id));
  const existing = await db.collection<Item>("items").find(
    { programKey: PROGRAM_KEY, subject: SUBJECT, standardCodes: { $in: [...TARGET_STANDARDS] } },
    { session },
  ).toArray();
  const existingOther = existing.filter((item) => !generatedIds.has(item._id));
  const existingKeys = exactDuplicateKeys(existingOther);
  const counts = Object.fromEntries(TARGET_STANDARDS.map((code) => [code, 0])) as Record<StandardCode, number>;
  const skippedIds = new Set<string>();

  const combinedByStandard = new Map<string, string[]>();
  for (const item of existingOther) {
    const standard = item.standardCodes[0] ?? "";
    const combined = `${textOfRich(item.prompt)} ${(item.options ?? []).map((option) => option.text).join(" ")}`;
    const list = combinedByStandard.get(standard) ?? [];
    list.push(combined);
    combinedByStandard.set(standard, list);
  }

  for (const item of generatedItems) {
    const standard = item.standardCodes[0] as StandardCode;
    const prompt = normalize(textOfRich(item.prompt));
    const answerSet = normalize((item.options ?? []).map((option) => option.text).sort().join("|"));
    const duplicatePromptId = existingKeys.prompts.get(prompt);
    const duplicateAnswerId = existingKeys.answerSetsByStandard.get(standard)?.get(answerSet);
    const combined = `${textOfRich(item.prompt)} ${(item.options ?? []).map((option) => option.text).join(" ")}`;
    const nearDuplicateId = (combinedByStandard.get(standard) ?? []).some((prior) => jaccard(combined, prior) > 0.96);
    if (duplicatePromptId || duplicateAnswerId || nearDuplicateId) {
      counts[standard] += 1;
      skippedIds.add(item._id);
    }
  }
  return { skippedIds, counts };
}

async function ensureIndexes(db: Db): Promise<void> {
  await db.collection("bundles").createIndex({ programKey: 1, subject: 1, version: 1 }, { unique: true });
  await db.collection("items").createIndex({ programKey: 1, subject: 1 });
  await db.collection("items").createIndex({ standardCodes: 1 });
  await db.collection("passages").createIndex({ programKey: 1, subject: 1 });
}

async function writeDatabase(db: Db, bundle: ReturnType<typeof contentBundleSchema.parse>, session?: ClientSession) {
  await verifyStandards(db, session);

  const generatedItems = bundle.items as Item[];
  const existingGenerated = await db.collection<Item>("items").find(
    { _id: { $in: generatedItems.map((item) => item._id) } },
    { session },
  ).project({ _id: 1, standardCodes: 1 }).toArray();
  const existingIds = new Set(existingGenerated.map((item) => item._id));
  const duplicateSkips = await duplicateReport(db, generatedItems, session);
  const itemsToWrite = generatedItems.filter((item) => !duplicateSkips.skippedIds.has(item._id));

  const now = new Date();
  await db.collection("bundles").updateOne(
    { programKey: PROGRAM_KEY, subject: SUBJECT, version: VERSION },
    {
      $set: {
        _id: BUNDLE_ID,
        programKey: PROGRAM_KEY,
        subject: SUBJECT,
        version: VERSION,
        status: "available",
        title: bundle.title,
        itemCount: itemsToWrite.length,
        updatedAt: now,
      },
      $setOnInsert: { createdAt: now },
    },
    { upsert: true, session } as never,
  );

  const passageWrites = bundle.passages.map((passage) => ({
    updateOne: {
      filter: { _id: `${BUNDLE_ID}:passage:${passage.id}` },
      update: {
        $set: {
          ...passage,
          _id: `${BUNDLE_ID}:passage:${passage.id}`,
          bundleId: BUNDLE_ID,
          programKey: PROGRAM_KEY,
          subject: SUBJECT,
        },
      },
      upsert: true,
    },
  }));
  if (passageWrites.length > 0) {
    await db.collection<StringIdDoc>("passages").bulkWrite(
      passageWrites as AnyBulkWriteOperation<StringIdDoc>[],
      { ordered: false, session },
    );
  }

  const itemWrites = itemsToWrite.map((item) => ({
    updateOne: {
      filter: { _id: item._id },
      update: { $set: item },
      upsert: true,
    },
  }));
  const bulk = itemWrites.length > 0
    ? await db.collection<Item>("items").bulkWrite(
      itemWrites as AnyBulkWriteOperation<Item>[],
      { ordered: false, session },
    )
    : null;

  const byStandard = Object.fromEntries(TARGET_STANDARDS.map((code) => {
    const all = generatedItems.filter((item) => item.standardCodes.includes(code));
    const writable = all.filter((item) => !duplicateSkips.skippedIds.has(item._id));
    const inserted = writable.filter((item) => !existingIds.has(item._id)).length;
    const updated = writable.length - inserted;
    return [code, { generated: all.length, inserted, updated, skippedDuplicates: duplicateSkips.counts[code] }];
  })) as Record<StandardCode, { generated: number; inserted: number; updated: number; skippedDuplicates: number }>;

  return {
    matched: bulk?.matchedCount ?? 0,
    modified: bulk?.modifiedCount ?? 0,
    upserted: bulk?.upsertedCount ?? 0,
    byStandard,
  };
}

async function validateDatabase(db: Db): Promise<Record<StandardCode, { total: number; uniquePracticeKeys: number }>> {
  const rows = await db.collection("items").aggregate([
    { $match: { programKey: PROGRAM_KEY, subject: SUBJECT, standardCodes: { $in: [...TARGET_STANDARDS] }, type: { $nin: ["scr", "ecr"] } } },
    { $unwind: "$standardCodes" },
    { $match: { standardCodes: { $in: [...TARGET_STANDARDS] } } },
    {
      $project: {
        standardCode: "$standardCodes",
        key: {
          $concat: [
            "$standardCodes",
            "\u001f",
            { $ifNull: ["$passageRef", ""] },
            "\u001f",
            "$type",
            "\u001f",
            {
              $reduce: {
                input: "$prompt",
                initialValue: "",
                in: {
                  $concat: [
                    "$$value",
                    " ",
                    {
                      $cond: [
                        { $eq: [{ $type: "$$this" }, "string"] },
                        "$$this",
                        { $ifNull: ["$$this.text", ""] },
                      ],
                    },
                  ],
                },
              },
            },
            "\u001f",
            {
              $reduce: {
                input: { $ifNull: ["$options", []] },
                initialValue: "",
                in: { $concat: ["$$value", "|", "$$this.key", ":", "$$this.text"] },
              },
            },
          ],
        },
      },
    },
    { $group: { _id: "$standardCode", total: { $sum: 1 }, uniquePracticeKeys: { $addToSet: "$key" } } },
    { $project: { _id: 1, total: 1, uniquePracticeKeys: { $size: "$uniquePracticeKeys" } } },
  ]).toArray();

  const result = Object.fromEntries(TARGET_STANDARDS.map((code) => [code, { total: 0, uniquePracticeKeys: 0 }])) as Record<StandardCode, { total: number; uniquePracticeKeys: number }>;
  for (const row of rows) result[row._id as StandardCode] = { total: row.total, uniquePracticeKeys: row.uniquePracticeKeys };

  const invalidItems = await db.collection("items").countDocuments({ programKey: PROGRAM_KEY, subject: SUBJECT, standardCodes: "31.0D" });
  const invalidStandards = await db.collection("standards").countDocuments({ programKey: PROGRAM_KEY, subject: SUBJECT, code: "31.0D" });
  if (invalidItems > 0 || invalidStandards > 0) throw new Error(`${db.databaseName}: invalid 31.0D content found after import`);
  for (const code of TARGET_STANDARDS) {
    if (result[code].uniquePracticeKeys < 150) {
      throw new Error(`${db.databaseName}: ${code} has ${result[code].uniquePracticeKeys} unique practice keys; expected at least 150`);
    }
  }
  return result;
}

const raw = JSON.parse(readFileSync(INPUT_FILE, "utf8"));
const bundle = contentBundleSchema.parse(raw);
validateGeneratedBundle(bundle);

const client = new MongoClient(env.mongodbUri);
await client.connect();
try {
  for (const dbName of DB_NAMES) {
    const db = client.db(dbName);
    await ensureIndexes(db);
    const { result, mode } = await withTransactionFallback(client, dbName, (session) => writeDatabase(db, bundle, session));
    console.log(`\n${dbName} import (${mode}): matched=${result.matched}, modified=${result.modified}, upserted=${result.upserted}`);
    for (const code of TARGET_STANDARDS) {
      const row = result.byStandard[code];
      console.log(`${dbName} ${code}: generated=${row.generated}, inserted=${row.inserted}, updated=${row.updated}, skippedDuplicates=${row.skippedDuplicates}`);
    }
    const validation = await validateDatabase(db);
    console.log(`${dbName} validation:`);
    for (const code of TARGET_STANDARDS) {
      const row = validation[code];
      console.log(`${dbName} ${code}: totalPracticeable=${row.total}, uniquePracticeKeys=${row.uniquePracticeKeys}`);
    }
  }
} finally {
  await client.close();
}
