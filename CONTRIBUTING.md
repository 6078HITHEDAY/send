# Contributing to Send

Thanks for helping. This project is MPL-2.0; by contributing you agree your
work is licensed under the same terms (see [LICENSE](LICENSE)).

## Development setup

1. Install [Bun](https://bun.sh) ≥ 1.4.
2. Clone https://github.com/6078HITHEDAY/send and run `bun install`.
3. Copy `.env.example` → `.env` (defaults work for local development).
4. Start the app: `bun run start` → http://localhost:1443

Redis is not required in development when `REDIS_HOST=localhost`.

## Workflow

1. Open an issue for non-trivial changes when you can.
2. Branch from `master`.
3. Keep PRs focused; do not mix refactors with unrelated features.
4. Before opening a PR, run:

   ```bash
   bun run typecheck
   bun run lint
   bun test
   bun run build
   ```

5. Use the pull request template and describe how you verified the change.

## Project map

- `src/client` — React UI
- `src/core` — crypto, transfers, archives (shared)
- `src/server` — Hono API, storage, WebSocket upload
- `e2e` — Playwright smoke tests
- `docs` — human documentation (keep in sync with code)

## Style

- TypeScript throughout; prefer explicit types at module boundaries.
- Format / lint with Biome (`bun run lint:fix`).
- Do not commit secrets, `.env`, or `dist/`.

## Security reports

Please do **not** open a public issue for vulnerabilities that could harm
self-hosters. Contact the repository maintainers privately via GitHub
Security Advisories on https://github.com/6078HITHEDAY/send when possible.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
