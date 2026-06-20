import { describe, it, expect } from "vitest";
import { assembleExam } from "~/domain/exam/assemble.js";
import type { Item } from "~/schemas/item.js";

function item(id: string, subject: string, code: string): Item {
  return {
    _id: id, bundleId: "b", programKey: "grade3_staar", subject,
    standardCodes: [code], type: "multiple_choice", difficulty: "easy",
    prompt: [id], figures: [], points: 1, allowPartialCredit: false, explanation: [], workedSolution: [],
  };
}

const mathBank = [
  ...Array.from({ length: 5 }, (_, i) => item(`m_t1_${i}`, "math", "3.2A")),
  ...Array.from({ length: 5 }, (_, i) => item(`m_t2_${i}`, "math", "3.4K")),
  ...Array.from({ length: 5 }, (_, i) => item(`m_t3_${i}`, "math", "3.3B")),
];
const rlaBank = [...Array.from({ length: 6 }, (_, i) => item(`r_t1_${i}`, "rla", "3.8A"))];

describe("assembleExam — progressive coverage", () => {
  it("first exam covers ONLY topic 1", () => {
    const ex = assembleExam({
      subjects: ["math"], bankBySubject: { math: mathBank },
      completedTopics: ["3.2A"], splitPct: { math: 100 }, totalItems: 10,
      durationSeconds: 600, breakSeconds: 300,
    });
    expect(ex.coverage).toEqual(["3.2A"]);
    expect(ex.itemIds.every((id) => id.startsWith("m_t1"))).toBe(true);
    expect(ex.itemIds).toHaveLength(5); // only 5 topic-1 items exist
  });

  it("later exams are cumulative over finished topics", () => {
    const ex = assembleExam({
      subjects: ["math"], bankBySubject: { math: mathBank },
      completedTopics: ["3.2A", "3.4K", "3.3B"], splitPct: { math: 100 }, totalItems: 9,
      durationSeconds: 600, breakSeconds: 300,
    });
    expect(new Set(ex.coverage)).toEqual(new Set(["3.2A", "3.4K", "3.3B"]));
    expect(ex.itemIds).toHaveLength(9);
  });
});

describe("assembleExam — weak-TEKS weighting", () => {
  it("covers every finished topic but gives the weak topic the most items", () => {
    const ex = assembleExam({
      subjects: ["math"], bankBySubject: { math: mathBank },
      completedTopics: ["3.2A", "3.4K", "3.3B"], weakTopics: ["3.3B"],
      splitPct: { math: 100 }, totalItems: 5, durationSeconds: 600, breakSeconds: 0,
    });
    // cumulative coverage: all three finished topics appear
    expect(new Set(ex.coverage)).toEqual(new Set(["3.2A", "3.4K", "3.3B"]));
    // weak topic (3.3B) gets the most items of the five
    const weakCount = ex.itemIds.filter((id) => id.startsWith("m_t3")).length;
    expect(weakCount).toBe(3);
    expect(ex.itemIds.filter((id) => id.startsWith("m_t1")).length).toBe(1);
  });
});

describe("assembleExam — split + sections + break", () => {
  it("sizes sections by split %, by item count and time, with a break", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"],
      bankBySubject: { math: mathBank, rla: rlaBank },
      completedTopics: ["3.2A", "3.4K", "3.3B", "3.8A"],
      splitPct: { math: 50, rla: 50 }, totalItems: 10,
      durationSeconds: 3600, breakSeconds: 300,
    });
    const math = ex.sections.find((s) => s.subject === "math")!;
    const rla = ex.sections.find((s) => s.subject === "rla")!;
    expect(math.itemIds).toHaveLength(5);
    expect(rla.itemIds).toHaveLength(5);
    expect(math.seconds).toBe(1800);
    expect(rla.seconds).toBe(1800);
    expect(ex.breakSeconds).toBe(300);
    expect(ex.itemIds).toHaveLength(10);
  });

  it("pure single-subject exam has no break", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"], bankBySubject: { math: mathBank, rla: rlaBank },
      completedTopics: ["3.2A", "3.4K", "3.3B", "3.8A"],
      splitPct: { math: 100, rla: 0 }, totalItems: 6, durationSeconds: 600, breakSeconds: 300,
    });
    expect(ex.sections.find((s) => s.subject === "rla")!.itemIds).toHaveLength(0);
    expect(ex.breakSeconds).toBe(0); // only one populated section
  });
});

describe("assembleExam — section seconds reconcile to duration (#6)", () => {
  it("section seconds always sum to durationSeconds despite rounding", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"], bankBySubject: { math: mathBank, rla: rlaBank },
      completedTopics: ["3.2A", "3.4K", "3.3B", "3.8A"],
      splitPct: { math: 50, rla: 50 }, totalItems: 10, durationSeconds: 3601, breakSeconds: 300,
    });
    const sum = ex.sections.reduce((n, s) => n + s.seconds, 0);
    expect(sum).toBe(3601);
  });
  it("gives all the time to the populated section when the other is empty", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"], bankBySubject: { math: mathBank, rla: [] },
      completedTopics: ["3.2A", "3.4K", "3.3B"], splitPct: { math: 50, rla: 50 }, totalItems: 6,
      durationSeconds: 3600, breakSeconds: 300,
    });
    expect(ex.sections.find((s) => s.subject === "math")!.seconds).toBe(3600);
    expect(ex.sections.find((s) => s.subject === "rla")!.seconds).toBe(0);
  });
});

describe("assembleExam — quota redistribution when a bank is short (#7)", () => {
  it("reallocates an empty subject's quota so the exam still hits totalItems", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"], bankBySubject: { math: mathBank, rla: [] }, // rla empty
      completedTopics: ["3.2A", "3.4K", "3.3B"], splitPct: { math: 50, rla: 50 }, totalItems: 10,
      durationSeconds: 3600, breakSeconds: 300,
    });
    // math (15 available) absorbs rla's 5 → 10 total, not 5
    expect(ex.itemIds).toHaveLength(10);
    expect(ex.sections.find((s) => s.subject === "math")!.itemIds).toHaveLength(10);
    expect(ex.breakSeconds).toBe(0); // only one populated section
  });

  it("does not exceed total availability", () => {
    const ex = assembleExam({
      subjects: ["math", "rla"], bankBySubject: { math: mathBank.slice(0, 4), rla: [] },
      completedTopics: ["3.2A"], splitPct: { math: 50, rla: 50 }, totalItems: 10,
      durationSeconds: 600, breakSeconds: 0,
    });
    expect(ex.itemIds).toHaveLength(4); // only 4 items exist anywhere
  });
});

describe("assembleExam — no-repeat", () => {
  it("excludes already-used items", () => {
    const used = new Set(["m_t1_0", "m_t1_1"]);
    const ex = assembleExam({
      subjects: ["math"], bankBySubject: { math: mathBank },
      completedTopics: ["3.2A"], usedIds: used, splitPct: { math: 100 }, totalItems: 10,
      durationSeconds: 600, breakSeconds: 0,
    });
    expect(ex.itemIds).not.toContain("m_t1_0");
    expect(ex.itemIds).toHaveLength(3); // 5 topic-1 items − 2 used
  });
});
