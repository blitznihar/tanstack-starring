import { describe, it, expect } from "vitest";
import { decideProfileImport } from "~/domain/profile/lww.js";

describe("decideProfileImport (last-write-wins by exportedAt)", () => {
  it("applies when the machine has no existing profile", () => {
    const d = decideProfileImport({ incomingExportedAt: "2026-01-01T00:00:00.000Z", existingExportedAt: null });
    expect(d.action).toBe("apply");
  });

  it("applies when the incoming export is newer", () => {
    const d = decideProfileImport({
      incomingExportedAt: "2026-06-19T10:00:00.000Z",
      existingExportedAt: "2026-06-18T09:00:00.000Z",
    });
    expect(d.action).toBe("apply");
  });

  it("skips when the incoming export is older", () => {
    const d = decideProfileImport({
      incomingExportedAt: "2026-06-17T00:00:00.000Z",
      existingExportedAt: "2026-06-18T00:00:00.000Z",
    });
    expect(d.action).toBe("skip");
  });

  it("skips an identical timestamp (not strictly newer)", () => {
    const t = "2026-06-19T12:00:00.000Z";
    expect(decideProfileImport({ incomingExportedAt: t, existingExportedAt: t }).action).toBe("skip");
  });

  it("compares ISO timestamps lexicographically (sub-second)", () => {
    expect(
      decideProfileImport({
        incomingExportedAt: "2026-06-19T12:00:00.500Z",
        existingExportedAt: "2026-06-19T12:00:00.499Z",
      }).action,
    ).toBe("apply");
  });
});
