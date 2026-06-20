import { describe, it, expect } from "vitest";
import { convert, rawToScale, scaleToLevel } from "~/domain/conversion/convert.js";
import type { ConversionTable } from "~/schemas/program.js";

const table: ConversionTable = {
  subject: "math",
  year: 2024,
  rows: [
    { rawMin: 0, rawMax: 5, scale: 1200 },
    { rawMin: 6, rawMax: 10, scale: 1400 },
    { rawMin: 11, rawMax: 15, scale: 1600 },
    { rawMin: 16, rawMax: 20, scale: 1800 },
  ],
  cutPoints: { approaches: 1400, meets: 1600, masters: 1800 },
};

describe("rawToScale", () => {
  it("maps raw into the right band", () => {
    expect(rawToScale(table, 3)).toBe(1200);
    expect(rawToScale(table, 8)).toBe(1400);
    expect(rawToScale(table, 18)).toBe(1800);
  });
  it("clamps out-of-range raw scores", () => {
    expect(rawToScale(table, -5)).toBe(1200);
    expect(rawToScale(table, 99)).toBe(1800);
  });
});

describe("scaleToLevel", () => {
  it("applies cut points", () => {
    expect(scaleToLevel(table, 1200)).toBe("did_not_meet");
    expect(scaleToLevel(table, 1400)).toBe("approaches");
    expect(scaleToLevel(table, 1600)).toBe("meets");
    expect(scaleToLevel(table, 1800)).toBe("masters");
  });
});

describe("convert", () => {
  it("produces raw→scale→level end to end", () => {
    expect(convert(table, 13)).toEqual({ raw: 13, scale: 1600, level: "meets" });
    expect(convert(table, 2)).toEqual({ raw: 2, scale: 1200, level: "did_not_meet" });
  });
});
