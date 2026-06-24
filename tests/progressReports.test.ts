import { describe, expect, it } from "vitest";
import { compactReportDate, practiceReportSubject } from "~/server/notifications/progressReports.js";

describe("practice report subjects", () => {
  it("includes the assigned practice date in YYYYMMDD format", () => {
    expect(compactReportDate("2026-06-22")).toBe("20260622");
    expect(practiceReportSubject("Araina Malali", "2026-06-22")).toBe("Practice report for Araina Malali - 20260622");
  });
});
