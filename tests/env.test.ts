import { describe, expect, it } from "vitest";
import { mongodbDatabaseNameForVercelEnv } from "~/lib/env.js";

describe("mongodbDatabaseNameForVercelEnv", () => {
  it("uses comet only for Vercel production", () => {
    expect(mongodbDatabaseNameForVercelEnv("production")).toBe("comet");
    expect(mongodbDatabaseNameForVercelEnv("Production")).toBe("comet");
  });

  it("uses comet-dev for local, preview, and other environments", () => {
    expect(mongodbDatabaseNameForVercelEnv()).toBe("comet-dev");
    expect(mongodbDatabaseNameForVercelEnv("preview")).toBe("comet-dev");
    expect(mongodbDatabaseNameForVercelEnv("development")).toBe("comet-dev");
    expect(mongodbDatabaseNameForVercelEnv("staging")).toBe("comet-dev");
  });
});
