import { COLLECTIONS, getCollection } from "./db.js";
import { ObjectId } from "mongodb";
import type { User } from "~/schemas/user.js";
import type { Role } from "~/schemas/common.js";

type UserDoc = User & { _id?: string };

async function col() {
  const c = await getCollection<UserDoc>(COLLECTIONS.users);
  await c.createIndex({ username: 1 }, { unique: true });
  return c;
}

export const usersRepo = {
  async findByUsername(username: string): Promise<UserDoc | null> {
    return (await col()).findOne({ username });
  },

  async findById(id: string): Promise<UserDoc | null> {
    const users = await col();
    const direct = await users.findOne({ _id: id });
    if (direct) return direct;
    return ObjectId.isValid(id) ? users.findOne({ _id: new ObjectId(id) as unknown as string }) : null;
  },

  async list(): Promise<UserDoc[]> {
    return (await col()).find().sort({ createdAt: -1 }).toArray();
  },

  async findByRole(role: Role): Promise<UserDoc | null> {
    return (await col()).findOne({ roles: role, active: true });
  },

  async insert(user: User): Promise<UserDoc> {
    const now = new Date();
    const doc: UserDoc = { ...user, createdAt: now, updatedAt: now };
    await (await col()).insertOne(doc);
    return doc;
  },

  async update(
    id: string,
    patch: Partial<Pick<User, "username" | "displayName" | "roles" | "studentIds" | "parentIds" | "active" | "forceChangeOnFirstLogin">>,
  ): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { ...patch, updatedAt: new Date() } });
  },

  async updatePassword(id: string, passwordHash: string, forceChange = false): Promise<void> {
    await (await col()).updateOne(
      { _id: id },
      { $set: { passwordHash, forceChangeOnFirstLogin: forceChange, updatedAt: new Date() } },
    );
  },

  async setActive(id: string, active: boolean): Promise<void> {
    await (await col()).updateOne({ _id: id }, { $set: { active, updatedAt: new Date() } });
  },

  async delete(id: string): Promise<void> {
    await (await col()).deleteOne({ _id: id });
  },
};
