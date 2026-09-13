# Localization

UI copy lives in Fluent (`.ftl`) files under [`public/locales/`](../public/locales/).
The React app loads them through the client i18n helpers in `src/client/i18n/`.

## Layout

```
public/locales/
  en-US/send.ftl
  … other locale directories …
```

`package.json` → `availableLanguages` lists locales the build/runtime expose.

## Development

- Set `L10N_DEV=true` to ease locale iteration when supported by the server
  config.
- Prefer editing `en-US` first, then port strings to other locales.
- Keep message ids stable; rename only with a migration plan for translators.

## Adding a locale

1. Copy `public/locales/en-US/` to `public/locales/<lang>/`.
2. Translate `send.ftl`.
3. Add `<lang>` to `availableLanguages` in `package.json`.
4. Smoke-test the UI with a matching `Accept-Language` header or browser locale.
