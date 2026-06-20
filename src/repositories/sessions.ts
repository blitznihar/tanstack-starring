import { COLLECTIONS, getCollection } from "./db.js";

export type SessionDoc = {
  _id: string; // the session token
  userId: string;
  createdAt: Date;
  expiresAt: Date;
};

async function col() {
  const c = await getCollection<SessionDoc>(COLLECTIONS.sessions);
  await c.createIndex({ userId: 1 });
  // TTL index: Mongo evicts expired sessions automatically.
  await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  return c;
}

export const sessionsRepo = {
  async create(token: string, userId: string, ttlMs: number): Promise<SessionDoc> {
    const now = new Date();
    const doc: SessionDoc = {
      _id: token,
      userId,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
    };
    await (await col()).insertOne(doc);
    return doc;
  },

  async find(token: string): Promise<SessionDoc | null> {
    const doc = await (await col()).findOne({ _id: token });
    if (!doc) return null;
    if (doc.expiresAt.getTime() < Date.now()) {
      await this.destroy(token);
      return null;
    }
    return doc;
  },

  async destroy(token: string): Promise<void> {
    await (await col()).deleteOne({ _id: token });
  },
};
