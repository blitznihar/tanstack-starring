import { describe, expect, it } from "vitest";
import { toIso } from "~/lib/dates";

describe("date coercion", () => {
  it("serializes Dates, ISO strings, and epoch numbers", () => {
    const iso = "2026-06-19T12:00:00.000Z";
    expect(toIso(new Date(iso))).toBe(iso);
    expect(toIso(iso)).toBe(iso);
    expect(toIso(Date.parse(iso))).toBe(iso);
  });

  it("returns null for malformed values instead of throwing", () => {
    expect(toIso(null)).toBeNull();
    expect(toIso({})).toBeNull();
    expect(toIso("not-a-date")).toBeNull();
  });
});
