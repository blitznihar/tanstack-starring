import { describe, it, expect } from "vitest";
import { generatePassword } from "~/server/auth/password.js";
import { can, capabilitiesFor, requireCapability, ForbiddenError } from "~/server/auth/rbac.js";

describe("generatePassword", () => {
  it("produces the requested length with all character classes", () => {
    const pw = generatePassword(16);
    expect(pw).toHaveLength(16);
    expect(pw).toMatch(/[a-z]/);
    expect(pw).toMatch(/[A-Z]/);
    expect(pw).toMatch(/[0-9]/);
    expect(pw).toMatch(/[!@#$%^&*?]/);
  });
  it("is non-deterministic", () => {
    expect(generatePassword()).not.toBe(generatePassword());
  });
});

describe("RBAC capabilities", () => {
  it("grants super_admin pricing + user management", () => {
    expect(can(["super_admin"], "pricing.manage")).toBe(true);
    expect(can(["super_admin"], "users.manage")).toBe(true);
  });
  it("admin can configure rewards and robux rules but not pricing", () => {
    expect(can(["admin"], "rewards.configure")).toBe(true);
    expect(can(["admin"], "robuxRules.configure")).toBe(true);
    expect(can(["admin"], "pricing.manage")).toBe(false);
  });
  it("parent is read-only oversight + payments", () => {
    expect(can(["parent"], "payment.make")).toBe(true);
    expect(can(["parent"], "content.import")).toBe(false);
  });
  it("student can learn and request redemptions", () => {
    expect(can(["student"], "learn.do")).toBe(true);
    expect(can(["student"], "redemption.request")).toBe(true);
    expect(can(["student"], "redemption.fulfill")).toBe(false);
  });
  it("unions capabilities across multiple roles", () => {
    const caps = capabilitiesFor(["parent", "student"]);
    expect(caps.has("payment.make")).toBe(true);
    expect(caps.has("learn.do")).toBe(true);
  });
  it("requireCapability throws ForbiddenError when missing", () => {
    expect(() => requireCapability(["student"], "users.manage")).toThrow(ForbiddenError);
    expect(() => requireCapability(["super_admin"], "users.manage")).not.toThrow();
  });
});
