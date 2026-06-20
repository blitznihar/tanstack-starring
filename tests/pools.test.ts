import { describe, it, expect } from "vitest";
import { groupIntoPools, selectUnused, statusFor, lowOrExhaustedPools, DEFAULT_THRESHOLDS } from "~/domain/pools/pools.js";
import type { Item } from "~/schemas/item.js";

function item(id: string, code: string): Item {
  return {
    _id: id,
    bundleId: "b",
    programKey: "grade3_staar",
    subject: "math",
    standardCodes: [code],
    type: "multiple_choice",
    difficulty: "easy",
    prompt: [`q${id}`],
    figures: [],
    points: 1,
    allowPartialCredit: false,
    explanation: [],
    workedSolution: [],
  };
}

describe("statusFor", () => {
  const t = { target: 30, lowThreshold: 2 };
  it("classifies exhausted / running_low / ok", () => {
    expect(statusFor(0, t)).toBe("exhausted");
    expect(statusFor(1, t)).toBe("running_low");
    expect(statusFor(2, t)).toBe("running_low");
    expect(statusFor(3, t)).toBe("ok");
  });
});

describe("groupIntoPools — no-repeat depletion", () => {
  const items = [item("a", "3.2D"), item("b", "3.2D"), item("c", "3.2D"), item("d", "3.4K")];

  it("computes total/used/unused per pool against used ids", () => {
    const used = new Set(["a", "b"]); // 3.2D has 1 unused left; 3.4K fully fresh
    const pools = groupIntoPools(items, used);
    const p32d = pools.find((p) => p.standardCode === "3.2D")!;
    const p34k = pools.find((p) => p.standardCode === "3.4K")!;
    expect(p32d).toMatchObject({ total: 3, used: 2, unused: 1, status: "running_low" });
    expect(p34k).toMatchObject({ total: 1, used: 0, unused: 1, status: "running_low" });
  });

  it("marks a fully-used pool exhausted", () => {
    const pools = groupIntoPools(items, new Set(["d"]));
    const p34k = pools.find((p) => p.standardCode === "3.4K")!;
    expect(p34k.status).toBe("exhausted");
    expect(p34k.unused).toBe(0);
  });

  it("computes the refill need toward the target", () => {
    const pools = groupIntoPools(items, new Set(), { thresholds: { target: 5, lowThreshold: 2 } });
    expect(pools.find((p) => p.standardCode === "3.2D")!.need).toBe(2); // target 5 - 3 unused
    expect(pools.find((p) => p.standardCode === "3.4K")!.need).toBe(4); // 5 - 1
  });
});

describe("selectUnused — no-repeat selection", () => {
  const items = [item("a", "3.2D"), item("b", "3.2D"), item("c", "3.2D")];
  it("returns only unused items, in order, capped at count", () => {
    expect(selectUnused(items, new Set(["a"]), 5).map((i) => i._id)).toEqual(["b", "c"]);
    expect(selectUnused(items, new Set(), 2).map((i) => i._id)).toEqual(["a", "b"]);
  });
  it("never repeats an already-used item", () => {
    const picked = selectUnused(items, new Set(["a", "b"]), 10);
    expect(picked.map((i) => i._id)).toEqual(["c"]);
  });
});

describe("lowOrExhaustedPools", () => {
  it("filters to the deficit set", () => {
    const items = [item("a", "3.2D"), item("b", "3.2D"), item("c", "3.2D"), item("d", "3.4K")];
    const pools = groupIntoPools(items, new Set(["d"]), { thresholds: DEFAULT_THRESHOLDS });
    const deficits = lowOrExhaustedPools(pools);
    // 3.2D has 3 unused (ok with default lowThreshold 2); 3.4K is exhausted.
    expect(deficits.map((p) => p.standardCode)).toEqual(["3.4K"]);
  });
});
