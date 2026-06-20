import { describe, expect, it } from "vitest";
import { prepareLessonUpload } from "~/server/content/lessonImport.js";

const lessonUpload = {
  subject: "rla",
  lessons: [
    {
      standardCode: "3.6G",
      title: "Use Evidence From the Text",
      intro: "Good reading answers prove the idea with words from the passage.",
      body: [
        { kind: "heading", level: 2, text: "Look back before answering" },
        { kind: "html", html: "<p><strong>Evidence</strong> proves the answer.</p>" },
        { kind: "svg", alt: "Claim plus evidence diagram", svg: "<svg viewBox='0 0 100 40'><text x='4' y='20'>Evidence</text></svg>" },
      ],
      practiceExamples: [
        {
          prompt: ["Which sentence is the best evidence?"],
          options: [
            { key: "A", text: "A small detail" },
            { key: "B", text: "A sentence that proves the idea", correct: true },
          ],
          answer: ["B. A sentence that proves the idea"],
          explanation: ["The answer points directly to proof in the text."],
        },
      ],
    },
  ],
};

describe("prepareLessonUpload", () => {
  it("normalizes lesson JSON and keeps practice examples with the lesson", () => {
    const lessons = prepareLessonUpload("grade3_staar", lessonUpload);
    expect(lessons).toHaveLength(1);
    expect(lessons[0]!._id).toBe("grade3_staar:rla:3.6G:lesson:v1");
    expect(lessons[0]!.programKey).toBe("grade3_staar");
    expect(lessons[0]!.subject).toBe("rla");
    expect(lessons[0]!.body.map((block) => block.kind)).toEqual(["heading", "html", "svg"]);
    expect(lessons[0]!.practiceExamples).toHaveLength(1);
    expect(lessons[0]!.practiceExamples[0]!.options[1]!.correct).toBe(true);
  });

  it("rejects duplicate lesson ids in one upload", () => {
    const duplicate = {
      lessons: [
        { ...lessonUpload.lessons[0], _id: "same", subject: "rla" },
        { ...lessonUpload.lessons[0], _id: "same", subject: "rla" },
      ],
    };
    expect(() => prepareLessonUpload("grade3_staar", duplicate)).toThrow(/Duplicate lesson/);
  });

  it("requires at least one lesson", () => {
    expect(() => prepareLessonUpload("grade3_staar", { lessons: [] })).toThrow(/No lessons/);
  });
});
