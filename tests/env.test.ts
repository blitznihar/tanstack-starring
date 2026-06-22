import { describe, expect, it } from "vitest";
import { mongodbDatabaseNameForEnv, mongodbDatabaseNameForVercelEnv } from "~/lib/env.js";

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

describe("mongodbDatabaseNameForEnv", () => {
  it("uses an explicit Mongo database override before Vercel defaults", () => {
    expect(mongodbDatabaseNameForEnv({ mongodbDatabase: "comet", vercelEnv: "preview" })).toBe("comet");
    expect(mongodbDatabaseNameForEnv({ mongodbDatabase: "comet-dev", vercelEnv: "production" })).toBe("comet-dev");
  });

  it("falls back to Vercel-derived names when the override is empty", () => {
    expect(mongodbDatabaseNameForEnv({ mongodbDatabase: "", vercelEnv: "production" })).toBe("comet");
    expect(mongodbDatabaseNameForEnv({ mongodbDatabase: "   ", vercelEnv: "development" })).toBe("comet-dev");
  });
});
