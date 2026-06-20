# Comet API/UI container (§16 packaging). Built by `docker compose up`.
# Multi-stage: install + build with Bun, then run the built TanStack handler.
FROM oven/bun:1 AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/bun.lock ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/scripts/serve-dist.mjs ./scripts/serve-dist.mjs
EXPOSE 3000
CMD ["bun", "scripts/serve-dist.mjs"]
