import { z } from "zod";
import { roleSchema } from "./common.js";

export const userSchema = z.object({
  _id: z.string().optional(),
  username: z.string().min(3).max(64),
  displayName: z.string().min(1),
  email: z.string().email().default("blitznihar@gmail.com"),
  emailConfirmed: z.boolean().default(false),
  roles: z.array(roleSchema).min(1),
  /** Parent profiles list the students they can see. */
  studentIds: z.array(z.string()).default([]),
  /** Admin profiles list the parents, and therefore students, they can manage. */
  parentIds: z.array(z.string()).default([]),
  passwordHash: z.string().min(1),
  forceChangeOnFirstLogin: z.boolean().default(false),
  active: z.boolean().default(true),
  createdAt: z.date().optional(),
  updatedAt: z.date().optional(),
});
export type User = z.infer<typeof userSchema>;

/** Public user shape — never leak passwordHash to clients. */
export const publicUserSchema = userSchema.omit({ passwordHash: true });
export type PublicUser = z.infer<typeof publicUserSchema>;

/** Server-function input for creating a user (admin/super_admin only). */
export const createUserInputSchema = z.object({
  username: z.string().min(3).max(64),
  displayName: z.string().min(1),
  email: z.string().email().default("blitznihar@gmail.com"),
  roles: z.array(roleSchema).length(1),
  studentIds: z.array(z.string()).default([]),
  parentIds: z.array(z.string()).default([]),
  password: z.string().min(8).optional(),
  forceChangeOnFirstLogin: z.boolean().default(true),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const loginInputSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInputSchema>;
