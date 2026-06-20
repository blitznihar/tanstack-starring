import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: {
    alias: { "~": src },
  },
  // Native / heavy node modules must stay external to the SSR bundle.
  ssr: {
    external: ["argon2", "mongodb", "stripe"],
  },
  plugins: [
    tanstackStart(), // MUST come before react()
    viteReact(),
  ],
});
