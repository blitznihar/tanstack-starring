/**
 * The Item JSON schema, as embedded verbatim in authoring prompts so an offline
 * LLM emits items that re-import cleanly through the single upload. Mirrors
 * src/schemas/item.ts (§5) — keep in sync.
 */
export const ITEM_SCHEMA_TEXT = `type Difficulty = "easy" | "medium" | "hard";
type ItemType =
  | "multiple_choice" | "multiselect" | "multipart" | "inline_choice"
  | "text_entry" | "hot_text" | "hot_spot" | "drag_and_drop" | "number_line"
  | "scr" | "ecr";
type Figure = { id: string; kind: "svg"|"png"|"bar_graph"|"pictograph"|"dot_plot"|
  "number_line"|"grid"|"base10_blocks"|"fraction_strip"|"array_model"|"area_model"|"shape";
  svg?: string; assetId?: string; data?: object; alt: string; caption?: string };
type Option = { key: string; text: string; correct?: boolean; rationale?: string };
type Item = {
  standardCodes: string[];            // REQUIRED — TEKS/standard codes this item assesses
  type: ItemType; difficulty: Difficulty;
  passageRef?: string;
  prompt: RichContent;                // array of strings or {kind,text,...} nodes
  figures: Figure[];                  // inline SVG where a figure is referenced
  options?: Option[];                 // selected-response choices, each with per-choice rationale
  correct?: string | string[];        // answer key for hot_text/multiselect where not on options
  parts?: { id; prompt; type; options?; correct?; answer? }[];  // multipart Part A / Part B
  blanks?: Record<string,string>;     // inline_choice / text_entry: blankId -> correct value
  answer?: string;                    // text_entry / number_line value
  zones?: { id; x; y; r }[];          // hot_spot
  tokens?: { id; text }[];            // hot_text
  draggables?: { id; text }[]; targets?: { id; accepts: string[] }[];  // drag_and_drop
  rubric?: { maxPoints: number; criteria: { id; description; points }[] };  // scr / ecr only
  points: number; allowPartialCredit: boolean;
  explanation: RichContent;           // WHY the right answer is right AND, per option, why each wrong choice is wrong
  workedSolution: RichContent;        // full step-by-step solution
};`;
