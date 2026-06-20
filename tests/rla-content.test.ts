import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { prepareBundle } from "~/server/content/import.js";
import { assembleExam } from "~/domain/exam/assemble.js";
import { assemblePractice } from "~/domain/practice/practice.js";
import { scoreItem } from "~/domain/scoring/score.js";
import type { Item } from "~/schemas/item.js";

const here = dirname(fileURLToPath(import.meta.url));
const rlaJson = JSON.parse(readFileSync(join(here, "..", "content", "grade3_rla.json"), "utf8"));
const prepared = prepareBundle(rlaJson);
const items = prepared.items;

describe("Grade 3 RLA bundle (§20.2)", () => {
  it("validates, with passages and a ≥30-item practice bank", () => {
    expect(prepared.bundleId).toBe("grade3_staar:rla:v1");
    expect(prepared.passages.length).toBeGreaterThanOrEqual(3);
    const practiceable = items.filter((i) => i.type !== "scr" && i.type !== "ecr");
    expect(practiceable.length).toBeGreaterThanOrEqual(30);
  });

  it("uses the full item-type range incl SCR (2pt) and ECR (5pt)", () => {
    const types = new Set(items.map((i) => i.type));
    for (const t of ["multiple_choice", "multiselect", "inline_choice", "text_entry", "hot_text", "multipart", "scr", "ecr"]) {
      expect(types.has(t as Item["type"])).toBe(true);
    }
    expect(items.some((i) => i.type === "scr" && (i.rubric?.maxPoints ?? 0) === 2)).toBe(true);
    expect(items.some((i) => i.type === "ecr" && (i.rubric?.maxPoints ?? 0) === 5)).toBe(true);
  });

  it("every passageRef resolves to a passage in the bundle", () => {
    const ids = new Set(prepared.passages.map((p) => p.id));
    for (const it of items) {
      if (it.passageRef) expect(ids.has(it.passageRef)).toBe(true);
    }
  });
});

describe("RLA practice assembly excludes written items", () => {
  it("never serves SCR/ECR in practice (instant feedback only)", () => {
    const config = Object.fromEntries(
      [...new Set(items.flatMap((i) => i.standardCodes))].map((c) => [c, { q: 10, m: 5 }]),
    );
    const out = assemblePractice(items, new Set(), config);
    expect(out.questions.length).toBeGreaterThan(0);
    expect(out.questions.every((q) => q.type !== "scr" && q.type !== "ecr")).toBe(true);
    // bankTotal reflects practiceable items only.
    expect(out.bankTotal).toBe(items.filter((i) => i.type !== "scr" && i.type !== "ecr").length);
  });
});

describe("inline_choice is KEY-scored, consistent with every other option type (M7 review fix)", () => {
  const item: Item = {
    _id: "ic1", bundleId: "b", programKey: "grade3_staar", subject: "rla",
    standardCodes: ["3.7C"], type: "inline_choice", difficulty: "easy",
    prompt: ["The wind blew the leaves ___."], figures: [],
    // key !== text on purpose — the exact case the old "commit the option text" UI broke.
    options: [
      { key: "A", text: "gently" },
      { key: "B", text: "moving violently", correct: true },
    ],
    blanks: { b1: "B" }, // blanks stores the option KEY
    points: 1, allowPartialCredit: false, explanation: [], workedSolution: [],
  };

  it("scores full marks when the committed value is the option KEY", () => {
    expect(scoreItem(item, { b1: "B" }).correct).toBe(true);
  });

  it("does NOT score when the committed value is the option TEXT (the pre-fix bug)", () => {
    expect(scoreItem(item, { b1: "moving violently" }).correct).toBe(false);
  });

  it("import rejects an inline_choice whose blank value is not an option key", () => {
    const bad = {
      programKey: "grade3_staar", subject: "rla", version: 1, status: "available",
      title: "bad", standards: [], passages: [],
      items: [{
        standardCodes: ["3.7C"], type: "inline_choice", difficulty: "easy",
        prompt: ["x ___"],
        options: [{ key: "A", text: "one" }, { key: "B", text: "two", correct: true }],
        blanks: { b1: "two" }, // WRONG: stores display text, not the key
        explanation: ["e"], workedSolution: ["w"],
      }],
    };
    expect(() => prepareBundle(bad)).toThrow(/not one of its option keys/);
  });

  it("every authored RLA inline_choice already satisfies the key contract", () => {
    for (const it of items) {
      if (it.type !== "inline_choice" || !it.blanks || !it.options) continue;
      const keys = new Set(it.options.map((o) => o.key));
      for (const v of Object.values(it.blanks)) expect(keys.has(v)).toBe(true);
    }
  });
});

describe("Math + RLA 50/50 exam with a section break (§19 M7)", () => {
  const mathBank: Item[] = Array.from({ length: 8 }, (_, i) => ({
    _id: `m${i}`, bundleId: "b", programKey: "grade3_staar", subject: "math",
    standardCodes: ["3.2A"], type: "multiple_choice", difficulty: "easy",
    prompt: [`m${i}`], figures: [], points: 1, allowPartialCredit: false, explanation: [], workedSolution: [],
  }));
  const rlaCodes = [...new Set(items.map((i) => i.standardCodes[0]!))];

  it("builds two sections (math, rla) with a break between them", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"],
      bankBySubject: { math: mathBank, rla: items },
      completedTopics: ["3.2A", ...rlaCodes],
      splitPct: { math: 50, rla: 50 },
      totalItems: 10,
      durationSeconds: 3600,
      breakSeconds: 300,
    });
    expect(ex.sections).toHaveLength(2);
    expect(ex.sections.map((s) => s.subject)).toEqual(["math", "rla"]);
    expect(ex.breakSeconds).toBe(300);
    // both halves populated (50/50)
    expect(ex.sections[0]!.itemIds.length).toBeGreaterThan(0);
    expect(ex.sections[1]!.itemIds.length).toBeGreaterThan(0);
    // section seconds reconcile to total duration
    expect(ex.sections.reduce((n, s) => n + s.seconds, 0)).toBe(3600);
  });
});
