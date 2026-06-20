import { ITEM_SCHEMA_TEXT } from "./itemSchemaText.js";

/**
 * Offline authoring-prompt generators (§5, Appendix A). NEVER calls an LLM —
 * these emit copy-paste text a human pastes into any LLM offline; the JSON array
 * that comes back is re-imported through the single upload, closing the loop with
 * no runtime LLM call.
 */

export type RefillPoolDeficit = {
  /** Human concept name, e.g. "Comparing numbers". */
  conceptName: string;
  /** Standard/TEKS code, e.g. "3.2D". */
  standardCode: string;
  /** How many new items are needed for this pool. */
  need: number;
  /** "running_low" | "exhausted" — drives the [tag]. */
  status: "running_low" | "exhausted";
};

export type RefillPromptInput = {
  /** e.g. "Grade 3 Texas STAAR". Used in the header line. */
  programTitle: string;
  /** Existing item stems (prompts) the author must NOT duplicate. */
  existingStems: string[];
  deficits: RefillPoolDeficit[];
  /** Override the embedded schema (defaults to the canonical Item schema). */
  schemaText?: string;
};

function statusTag(status: RefillPoolDeficit["status"]): string {
  return status === "exhausted" ? "POOL EXHAUSTED" : "running low";
}

/**
 * Compile all low/exhausted pools into ONE copy-paste authoring prompt
 * (Appendix A format): header + schema + the deficit list (counts + status
 * tags) + the no-duplicate instruction with existing stems to avoid.
 */
export function buildRefillPrompt(input: RefillPromptInput): string {
  const schema = input.schemaText ?? ITEM_SCHEMA_TEXT;
  const poolLines = input.deficits
    .map((d) => `• ${d.conceptName} (TEKS ${d.standardCode}) — need ${d.need} new items [${statusTag(d.status)}]`)
    .join("\n");

  const stems = input.existingStems.length
    ? input.existingStems.map((s) => `- ${s}`).join("\n")
    : "(none on record)";

  return `You are an item writer for a ${input.programTitle} practice platform.
Generate fresh, non-duplicate practice problems for the pools listed below.
These pools are low or exhausted — students would otherwise repeat questions.

OUTPUT FORMAT: a JSON array of Item objects matching this schema:

${schema}

Each item needs: standardCodes, type, difficulty, prompt, figures (inline SVG where a
figure is referenced), full answer key, allowPartialCredit, explanation (with per-choice
rationale), and workedSolution. Do NOT duplicate any existing stem.

EXISTING STEMS (do not reuse or paraphrase):
${stems}

POOLS NEEDED:
${poolLines}
`;
}

export type NewProgramPromptInput = {
  programTitle: string; // e.g. "Grade 4 STAAR" / "GRE"
  category?: string; // "K-12" | "College Prep" | ...
  subjects: string[]; // e.g. ["math","rla"]
  targetDays: number;
  /** Approx items to author per subject (the author can adjust). */
  itemsPerSubject?: number;
  schemaText?: string;
};

/**
 * Produce an authoring prompt to create an ENTIRE new program's content
 * (subjects, topics, blueprint, item counts) in the Item schema — used when
 * adding SAT/GRE/Grade 4/5/XYZ.
 */
export function buildNewProgramPrompt(input: NewProgramPromptInput): string {
  const schema = input.schemaText ?? ITEM_SCHEMA_TEXT;
  const perSubject = input.itemsPerSubject ?? 30;
  const subjectLines = input.subjects.map((s) => `• ${s} — author ~${perSubject} items across its core topics`).join("\n");

  return `You are a curriculum designer and item writer creating a NEW program for a
multi-program practice platform: "${input.programTitle}"${input.category ? ` (${input.category})` : ""}.

Design the program end to end, then author its content:
1. List the program's subjects and, for each subject, its core topics/standards
   (with short codes and descriptions).
2. Propose an exam blueprint: subject split %, recommended exam durations, and a
   target of ${input.targetDays} learning days.
3. Author practice items for every topic.

SUBJECTS:
${subjectLines}

OUTPUT FORMAT: a JSON array of Item objects matching this schema. Tag every item
with standardCodes, subject, type, difficulty, a full answer key, explanation
(with per-choice rationale), and workedSolution:

${schema}

Aim for a mix of item types and difficulties per topic, with at least ${perSubject}
items per subject so students never repeat questions.
`;
}
