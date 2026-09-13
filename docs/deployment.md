# Deployment

## Checklist

1. Build assets: `bun run build` (or use the Docker image).
2. Run Redis and set `REDIS_HOST` / `REDIS_PORT` (and auth if any).
3. Choose blob storage:
   - **Filesystem:** set `FILE_DIR` to a persistent volume, or
   - **S3:** `S3_BUCKET` (+ optional `S3_ENDPOINT`, path-style flag), or
   - **GCS:** `GCS_BUCKET` and application credentials.
4. Set `NODE_ENV=production`, `BASE_URL` to your public HTTPS origin, and
   `PORT` (default `1443`).
5. Terminate TLS at a reverse proxy; proxy WebSocket `/api/ws` as well as HTTP.
6. Optionally configure FxA, Sentry, and UI notice HTML (see `.env.example`).

## Process

```bash
bun install --frozen-lockfile
bun run build
NODE_ENV=production BASE_URL=https://send.example.com REDIS_HOST=127.0.0.1 bun run prod
```

Or deploy with Compose: see [docker.md](docker.md).

## Reverse proxy

Ensure:

- HTTPS to clients
- `BASE_URL` matches the external URL (or enable `DETECT_BASE_URL`)
- WebSocket upgrade for `/api/ws`
- Reasonable max body size if you use `POST /api/upload` (WS streaming is preferred)

## Ops endpoints

| Path | Purpose |
| --- | --- |
| `/__lbheartbeat__` | Liveness (no dependency checks) |
| `/__heartbeat__` | Readiness (storage / Redis ping) |
| `/__version__` | Build metadata JSON |

## CI

GitHub Actions: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)  
GitLab CI (optional mirror): [`.gitlab-ci.yml`](../.gitlab-ci.yml)
