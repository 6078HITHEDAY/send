# Multi-stage Bun image. The builder produces dist/; the runtime image only
# needs the compiled assets, the server sources Bun can run directly, and the
# production node_modules.
FROM oven/bun:1.4-alpine AS builder

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1.4-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=1443

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY --from=builder /app/dist ./dist
COPY src ./src
COPY public/locales ./public/locales

# version.json is produced by `bun run build`; keep a stable path for
# /__version__ and for operators who volume-mount over dist/.
RUN ln -sf dist/version.json version.json

EXPOSE 1443

USER bun
CMD ["bun", "run", "prod"]
