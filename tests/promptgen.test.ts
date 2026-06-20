import { describe, it, expect } from "vitest";
import { buildRefillPrompt, buildNewProgramPrompt } from "~/domain/promptgen/promptgen.js";

describe("buildRefillPrompt — Appendix A format", () => {
  const prompt = buildRefillPrompt({
    programTitle: "Grade 3 Texas STAAR",
    existingStems: ["What is the value of the 7 in 4,732?", "347 + 285 = ?"],
    deficits: [
      { conceptName: "Comparing numbers", standardCode: "3.2D", need: 8, status: "running_low" },
      { conceptName: "Multiplication & division word problems", standardCode: "3.4K", need: 12, status: "exhausted" },
    ],
  });

  it("includes the program-specific header", () => {
    expect(prompt).toContain("You are an item writer for a Grade 3 Texas STAAR practice platform.");
    expect(prompt).toContain("students would otherwise repeat questions");
  });

  it("embeds the JSON schema", () => {
    expect(prompt).toContain("a JSON array of Item objects matching this schema");
    expect(prompt).toContain("standardCodes: string[]");
    expect(prompt).toContain('type ItemType');
  });

  it("instructs per-choice rationale and no duplication", () => {
    expect(prompt).toContain("per-choice");
    expect(prompt).toContain("Do NOT duplicate any existing stem");
  });

  it("lists existing stems to avoid", () => {
    expect(prompt).toContain("- What is the value of the 7 in 4,732?");
    expect(prompt).toContain("- 347 + 285 = ?");
  });

  it("lists each deficit pool with count and status tag", () => {
    expect(prompt).toContain("• Comparing numbers (TEKS 3.2D) — need 8 new items [running low]");
    expect(prompt).toContain("• Multiplication & division word problems (TEKS 3.4K) — need 12 new items [POOL EXHAUSTED]");
  });
});

describe("buildNewProgramPrompt", () => {
  const prompt = buildNewProgramPrompt({
    programTitle: "GRE",
    category: "College Prep",
    subjects: ["verbal", "quant"],
    targetDays: 60,
    itemsPerSubject: 40,
  });
  it("frames an entire new program and embeds the schema", () => {
    expect(prompt).toContain('creating a NEW program');
    expect(prompt).toContain('"GRE" (College Prep)');
    expect(prompt).toContain("target of 60 learning days");
    expect(prompt).toContain("• verbal — author ~40 items");
    expect(prompt).toContain("• quant — author ~40 items");
    expect(prompt).toContain("standardCodes: string[]");
  });
});
