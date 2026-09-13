# Build

Send uses **Bun** as package manager, bundler, and production runtime. There is
no webpack config in this tree.

## Development

```bash
bun install
bun run start
```

`bun run start` runs `src/server/dev.ts` with hot reload and serves the React
client. Default URL: http://localhost:1443

## Production assets

```bash
bun run build
```

This:

1. Cleans `dist/`
2. Writes version metadata (`scripts/write-version.ts`)
3. Bundles client / CSS / service worker via `scripts/build.ts`

Then serve with:

```bash
bun run prod
```

## Typecheck / lint

```bash
bun run typecheck   # tsc --noEmit
bun run lint        # biome check .
bun run format      # biome format --write .
```

## Tests

```bash
bun test            # unit + server tests
bun run test:e2e    # Playwright (needs `bunx playwright install`)
```
