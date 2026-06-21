import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));
const serverOnlyClientStubs: Record<string, string> = {
  argon2: "\0argon2-client-stub",
  mongodb: "\0mongodb-client-stub",
  newrelic: "\0newrelic-client-stub",
};

function stubServerOnlyPackagesInBrowser() {
  return {
    name: "stub-server-only-packages-in-browser",
    enforce: "pre" as const,
    resolveId(id: string, _importer: string | undefined, options: { ssr?: boolean } = {}) {
      const environmentName = this.environment?.name;
      const isClient = environmentName === "client" || (!options.ssr && environmentName !== "ssr");
      return isClient ? serverOnlyClientStubs[id] ?? null : null;
    },
    load(id: string) {
      if (id === serverOnlyClientStubs.mongodb) {
        return `
          class BrowserMongoError extends Error {
            constructor() {
              super("MongoDB is server-only in this app.");
            }
          }
          export class MongoClient {
            constructor() {
              throw new BrowserMongoError();
            }
          }
          export class ObjectId {
            static isValid() {
              return false;
            }
            constructor() {
              throw new BrowserMongoError();
            }
          }
        `;
      }
      if (id === serverOnlyClientStubs.argon2) {
        return `
          function browserArgon2Error() {
            return new Error("Argon2 password hashing is server-only in this app.");
          }
          export const argon2d = 0;
          export const argon2i = 1;
          export const argon2id = 2;
          export async function hash() {
            throw browserArgon2Error();
          }
          export async function verify() {
            throw browserArgon2Error();
          }
          export function needsRehash() {
            throw browserArgon2Error();
          }
          export default { argon2d, argon2i, argon2id, hash, verify, needsRehash };
        `;
      }
      if (id === serverOnlyClientStubs.newrelic) {
        return `
          function noop() {}
          export function recordMetric() {}
          export function noticeError() {}
          export function addCustomAttributes() {}
          export default { recordMetric: noop, noticeError: noop, addCustomAttributes: noop };
        `;
      }
      return null;
    },
  };
}

export default defineConfig({
  resolve: {
    alias: { "~": src },
  },
  optimizeDeps: {
    exclude: ["argon2", "mongodb", "newrelic"],
  },
  // Native / heavy node modules must stay external to the SSR bundle.
  ssr: {
    external: ["argon2", "mongodb", "newrelic", "stripe"],
  },
  plugins: [
    stubServerOnlyPackagesInBrowser(),
    tanstackStart(), // MUST come before react()
    nitro({
      traceDeps: ["newrelic*"],
      rollupConfig: {
        external: ["newrelic"],
      },
    }),
    viteReact(),
  ],
});
