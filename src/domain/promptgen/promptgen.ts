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

const LESSON_SCHEMA_TEXT = `{
  "lessons": [
    {
      "programKey": "grade3_staar",
      "subject": "math",
      "standardCode": "3.3B",
      "version": 1,
      "status": "available",
      "title": "Fractions on a Number Line",
      "intro": "A short student-friendly lesson introduction.",
      "reportingCategory": "Number and operations",
      "visualKind": "number_line | fraction_bars | place_value | array | text_evidence | steps",
      "vocabulary": [
        { "term": "Numerator", "meaning": "top number" }
      ],
      "body": [
        { "kind": "heading", "level": 2, "text": "What to notice" },
        { "kind": "paragraph", "text": "Plain text paragraph." },
        { "kind": "html", "html": "<p><strong>Formatted</strong> HTML is allowed. No scripts.</p>" },
        { "kind": "svg", "alt": "A simple model", "svg": "<svg viewBox='0 0 200 80' role='img'>...</svg>" },
        { "kind": "list", "ordered": false, "items": ["Step one", "Step two"] },
        { "kind": "callout", "tone": "info", "title": "Remember", "text": "A short tip." }
      ],
      "practiceExamples": [
        {
          "id": "ex1",
          "prompt": ["A lesson-only concept check question."],
          "options": [
            { "key": "A", "text": "Choice A" },
            { "key": "B", "text": "Choice B", "correct": true, "rationale": "This matches the lesson." }
          ],
          "answer": ["B. Choice B"],
          "explanation": ["Explain the thinking in one or two student-friendly sentences."]
        }
      ]
    }
  ]
}`;

export type LessonPromptInput = {
  programTitle: string;
  subject: string;
  standards: { code: string; description: string; reportingCategory?: string }[];
  existingLessonTitles?: string[];
  exampleStems?: string[];
};

export function buildLessonPrompt(input: LessonPromptInput): string {
  const standards = input.standards.length
    ? input.standards
        .map((standard) => `- ${standard.code}: ${standard.description}${standard.reportingCategory ? ` (${standard.reportingCategory})` : ""}`)
        .join("\n")
    : "- No standards were found. Author one lesson for the requested subject and include a clear standardCode.";
  const existingTitles = input.existingLessonTitles?.length
    ? input.existingLessonTitles.map((title) => `- ${title}`).join("\n")
    : "(none on record)";
  const stems = input.exampleStems?.length
    ? input.exampleStems.slice(0, 12).map((stem) => `- ${stem}`).join("\n")
    : "(none supplied)";

  return `You are a curriculum writer creating student-facing lessons for "${input.programTitle}".
Write concise lessons for the ${input.subject} subject before students start practice.

OUTPUT FORMAT: valid JSON matching this lesson upload shape:

${LESSON_SCHEMA_TEXT}

Author one lesson per standard listed below. Use grade-appropriate language, headings,
short paragraphs, and visual support. HTML blocks may include tags like <strong>,
<em>, <table>, and <span>. SVG blocks may include inline SVG diagrams. Do not include
scripts, event handlers, external assets, or CSS that depends on a remote file.

PracticeExamples are lesson-only concept checks. They are stored with the lesson, hidden
behind a "Show answer" control, and must not be authored as actual practice-bank Items.
Include 2 to 4 practiceExamples per lesson with clear answers and explanations.

STANDARDS:
${standards}

EXISTING LESSON TITLES TO AVOID DUPLICATING:
${existingTitles}

OPTIONAL EXISTING PRACTICE STEMS FOR STYLE MATCHING ONLY:
${stems}
`;
}
