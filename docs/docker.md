# Docker

Images are built from this repository’s [`Dockerfile`](../Dockerfile)
(`oven/bun:1.4-alpine`, multi-stage). Publish wherever you like; examples below
use a local tag and the GitHub-oriented name
`ghcr.io/6078hitheday/send`.

## Compose (recommended)

[`docker-compose.yml`](../docker-compose.yml) starts the app and Redis 8:

```bash
docker compose up --build
```

- App: http://localhost:1443
- Env defaults: `NODE_ENV=production`, `PORT=1443`, `REDIS_HOST=redis`,
  `BASE_URL=http://localhost:1443`

Override environment variables in the compose file or a sibling `.env`
(see [`.env.example`](../.env.example)).

## Build / run manually

Prefer Compose above when you can — it puts the app and Redis on one network
and sets `REDIS_HOST=redis` for you.

Standalone `docker run` against Redis on the host (Linux Docker Engine needs the
`host-gateway` mapping; Docker Desktop already defines `host.docker.internal`):

```bash
docker build -t ghcr.io/6078hitheday/send:latest .
docker run --rm -p 1443:1443 \
  --add-host=host.docker.internal:host-gateway \
  -e NODE_ENV=production \
  -e PORT=1443 \
  -e BASE_URL=https://send.example.com \
  -e REDIS_HOST=host.docker.internal \
  -e REDIS_PORT=6379 \
  -v send-data:/tmp \
  ghcr.io/6078hitheday/send:latest
```

Or join an existing Docker network and point `REDIS_HOST` at the Redis
container name / service name instead of `host.docker.internal`.

For S3/GCS set the bucket variables from `.env.example`; otherwise files are
stored on disk under `FILE_DIR` (ephemeral in the container unless you mount a
volume).

## Notes

- The runtime image runs as user `bun` and executes `bun run prod`.
- `dist/` is produced at build time; `src/` is copied so Bun can run the server
  TypeScript directly.
- Locales are copied from `public/locales`.
