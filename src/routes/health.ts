import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: async () =>
        Response.json(
          {
            ok: true,
            service: "comet-academy",
            status: "healthy",
            timestamp: new Date().toISOString(),
          },
          {
            headers: {
              "cache-control": "no-store",
            },
          },
        ),
    },
  },
});
