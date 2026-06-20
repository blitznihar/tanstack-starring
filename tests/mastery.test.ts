import { describe, it, expect } from "vitest";
import {
  updateMastery,
  classify,
  weakTopics,
  completedVsRemaining,
  circuitBrokenTopics,
  initialMastery,
  type MasteryState,
} from "~/domain/mastery/mastery.js";

describe("classify", () => {
  it("maps rolling accuracy to a level", () => {
    expect(classify(0.9)).toBe("mastered");
    expect(classify(0.6)).toBe("partial");
    expect(classify(0.2)).toBe("not_mastered");
  });
});

describe("updateMastery", () => {
  it("a first correct attempt masters the topic", () => {
    const s = updateMastery(undefined, "3.2A", true);
    expect(s).toMatchObject({ state: "mastered", rollingAccuracy: 1, attempts: 1, stuckCount: 0 });
  });
  it("rolling accuracy decays toward misses", () => {
    let s = updateMastery(undefined, "3.2A", true); // 1.0
    s = updateMastery(s, "3.2A", false); // 0.6 → partial
    expect(s.state).toBe("partial");
    s = updateMastery(s, "3.2A", false); // 0.36 → not_mastered
    expect(s.state).toBe("not_mastered");
  });
  it("trips the circuit-breaker after 3 consecutive not_mastered misses (§9)", () => {
    let s: MasteryState | undefined;
    s = updateMastery(s, "3.4K", false);
    expect(s.circuitBroken).toBe(false);
    s = updateMastery(s, "3.4K", false);
    expect(s.circuitBroken).toBe(false);
    s = updateMastery(s, "3.4K", false);
    expect(s.stuckCount).toBe(3);
    expect(s.circuitBroken).toBe(true);
  });
  it("resets stuckCount once the student climbs out of not_mastered", () => {
    let s = initialMastery("3.4K");
    s = updateMastery(s, "3.4K", false);
    s = updateMastery(s, "3.4K", false); // stuck 2
    // enough correct to leave not_mastered
    s = updateMastery(s, "3.4K", true);
    s = updateMastery(s, "3.4K", true);
    expect(s.stuckCount).toBe(0);
    expect(s.circuitBroken).toBe(false);
  });
});

describe("reporting helpers", () => {
  const states: MasteryState[] = [
    { standardCode: "3.2A", state: "mastered", rollingAccuracy: 0.9, attempts: 5, stuckCount: 0, circuitBroken: false },
    { standardCode: "3.4K", state: "not_mastered", rollingAccuracy: 0.2, attempts: 4, stuckCount: 3, circuitBroken: true },
    { standardCode: "3.3B", state: "partial", rollingAccuracy: 0.6, attempts: 3, stuckCount: 0, circuitBroken: false },
  ];
  it("weakTopics excludes mastered", () => {
    expect(weakTopics(states).sort()).toEqual(["3.3B", "3.4K"]);
  });
  it("completedVsRemaining splits by mastery", () => {
    const r = completedVsRemaining(states, ["3.2A", "3.4K", "3.3B", "3.5B"]);
    expect(r.completed).toEqual(["3.2A"]);
    expect(r.remaining).toEqual(["3.4K", "3.3B", "3.5B"]);
  });
  it("circuitBrokenTopics flags the stuck standard", () => {
    expect(circuitBrokenTopics(states)).toEqual(["3.4K"]);
  });
});
