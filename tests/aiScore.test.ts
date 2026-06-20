import { describe, it, expect } from "vitest";
import { parseDmrReply, extractJsonObject } from "~/domain/scoring/aiScore.js";

describe("extractJsonObject", () => {
  it("pulls the first balanced object out of prose + fences", () => {
    const raw = 'Sure! Here is the score:\n```json\n{"score": 2, "justification": "Great work.", "tips": ["Add evidence"]}\n```\nHope that helps.';
    const json = extractJsonObject(raw);
    expect(json).toBe('{"score": 2, "justification": "Great work.", "tips": ["Add evidence"]}');
  });

  it("handles braces inside strings", () => {
    const raw = '{"justification": "use { and } carefully", "score": 1}';
    expect(JSON.parse(extractJsonObject(raw)!)).toMatchObject({ score: 1 });
  });

  it("returns null when there is no object", () => {
    expect(extractJsonObject("no json here")).toBeNull();
  });
});

describe("parseDmrReply", () => {
  it("parses a clean reply and clamps within [0, maxPoints]", () => {
    const r = parseDmrReply('{"score": 5, "justification": "Strong.", "tips": ["nice"]}', 2);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.score).toBe(2); // clamped down to the rubric max
      expect(r.justification).toBe("Strong.");
      expect(r.tips).toEqual(["nice"]);
    }
  });

  it("allows half credit and floors negatives at 0", () => {
    expect(parseDmrReply('{"score": 1.5, "justification": "ok"}', 2)).toMatchObject({ ok: true, score: 1.5 });
    expect(parseDmrReply('{"score": -3, "justification": "blank"}', 5)).toMatchObject({ ok: true, score: 0 });
  });

  it("normalizes a string tips field into an array", () => {
    const r = parseDmrReply('{"score": 1, "justification": "ok", "tips": "Add a detail. Reread paragraph 2."}', 2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.tips.length).toBeGreaterThanOrEqual(1);
  });

  it("fails (→ manual queue) on non-JSON, missing fields, or empty", () => {
    expect(parseDmrReply("the answer is good", 2).ok).toBe(false);
    expect(parseDmrReply('{"justification": "no score"}', 2).ok).toBe(false);
    expect(parseDmrReply("", 2).ok).toBe(false);
  });

  it("tolerates a fenced reply", () => {
    const r = parseDmrReply('```json\n{"score": 2, "justification": "full marks"}\n```', 2);
    expect(r).toMatchObject({ ok: true, score: 2 });
  });
});

describe("parseDmrReply — multi-object replies (M7 review fix)", () => {
  it("accepts a leading scratch/reasoning object plus a single valid answer object", () => {
    const raw = '{"thinking":"let me reason about this"} Final answer: {"score":2,"justification":"good evidence"}';
    expect(parseDmrReply(raw, 2)).toMatchObject({ ok: true, score: 2, justification: "good evidence" });
  });

  it("routes to manual when TWO objects both validate (ambiguous draft vs final — never guess)", () => {
    const raw = '```json\n{"score":1,"justification":"draft"}\n```\n{"score":4,"justification":"final"}';
    expect(parseDmrReply(raw, 5).ok).toBe(false);
  });

  it("uses the one complete valid object and ignores a truncated trailing object", () => {
    const raw = '{"score":2,"justification":"complete"} {"score":3,"justifi';
    expect(parseDmrReply(raw, 2)).toMatchObject({ ok: true, score: 2 });
  });
});
