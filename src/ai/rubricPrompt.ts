import type { Rubric } from "~/schemas/item.js";

/**
 * Build the DMR chat messages for scoring one written response (§8). The SYSTEM
 * prompt IS the exact rubric. The model must reply with STRICT JSON
 * `{score, justification, tips}`. Kept pure so the prompt can be snapshot-tested.
 */
export type ChatMessage = { role: "system" | "user"; content: string };

export function buildScoringMessages(input: {
  itemType: "scr" | "ecr";
  question: string;
  rubric: Rubric;
  exemplar?: string;
  studentResponse: string;
}): ChatMessage[] {
  const { itemType, question, rubric, exemplar, studentResponse } = input;
  const criteria = rubric.criteria.map((c) => `- (${c.points} pt) ${c.description}`).join("\n");
  const kind = itemType === "scr" ? "short constructed response (SCR)" : "extended constructed response (ECR)";

  const system = [
    `You are a fair, encouraging Grade 3 reading teacher scoring a ${kind}.`,
    `Score the student's answer from 0 to ${rubric.maxPoints} points using ONLY this rubric:`,
    "",
    `RUBRIC (max ${rubric.maxPoints} points):`,
    criteria,
    exemplar ? `\nA full-credit answer looks roughly like:\n"${exemplar}"` : "",
    "",
    "Be generous with a 3rd grader's spelling and grammar; score the IDEAS and use of text evidence.",
    "Reply with STRICT JSON only — no prose, no markdown fences — in exactly this shape:",
    `{"score": <number 0-${rubric.maxPoints}>, "justification": "<one or two sentences>", "tips": ["<short next-step tip>", "..."]}`,
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `QUESTION:\n${question}`,
    "",
    `STUDENT RESPONSE:\n${studentResponse.trim() === "" ? "(the student left this blank)" : studentResponse}`,
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
