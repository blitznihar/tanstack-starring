# Comet API/UI container (§16 packaging). Built by `docker compose up` alongside
# MongoDB. Multi-stage: install + build with Bun, then run the Nitro server output.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
# The built server is self-contained under .output (TanStack Start / Nitro).
COPY --from=build /app/.output ./.output
EXPOSE 3000
# Run the server entry with Bun (no separate Node needed in the runtime image).
CMD ["bun", ".output/server/index.mjs"]
