import { existsSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = normalize(join(here, ".."));
const nitroEntry = join(root, ".output", "server", "index.mjs");

if (existsSync(nitroEntry)) {
  await import(pathToFileURL(nitroEntry).href);
} else {
  const serverEntry = await import("../dist/server/server.js").then((module) => module.default);
  const clientRoot = normalize(join(root, "dist", "client"));
  const port = Number(process.env.PORT || 3000);
  const hostname = process.env.HOST || "0.0.0.0";

  const mime = new Map([
    [".css", "text/css; charset=utf-8"],
    [".js", "text/javascript; charset=utf-8"],
    [".mjs", "text/javascript; charset=utf-8"],
    [".json", "application/json; charset=utf-8"],
    [".svg", "image/svg+xml"],
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".jpeg", "image/jpeg"],
    [".webp", "image/webp"],
    [".ico", "image/x-icon"],
    [".woff", "font/woff"],
    [".woff2", "font/woff2"],
  ]);

  function contentType(pathname) {
    const ext = pathname.includes(".") ? pathname.slice(pathname.lastIndexOf(".")) : "";
    return mime.get(ext.toLowerCase()) || "application/octet-stream";
  }

  function staticPath(url) {
    const pathname = decodeURIComponent(new URL(url).pathname);
    const candidate = normalize(join(clientRoot, pathname));
    const rel = relative(clientRoot, candidate);
    if (rel.startsWith("..") || rel === ".." || rel.startsWith("/")) return null;
    return candidate;
  }

  Bun.serve({
    hostname,
    port,
    async fetch(request) {
      if (request.method === "GET" || request.method === "HEAD") {
        const path = staticPath(request.url);
        if (path) {
          const file = Bun.file(path);
          if (await file.exists()) {
            return new Response(request.method === "HEAD" ? null : file, {
              headers: {
                "content-type": contentType(path),
                "cache-control": path.includes("/assets/") ? "public, max-age=31536000, immutable" : "no-cache",
              },
            });
          }
        }
      }
      return serverEntry.fetch(request);
    },
  });

  console.log(`Comet server listening on http://${hostname}:${port}`);
}
