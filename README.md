# PulseAPI React Client

PulseAPI is a Postman-style REST client built with React, TypeScript, and Vite.

## Features

- HTTP method and URL composer
- Query params, headers, auth, and request body tabs
- Bearer token and Basic auth helpers
- JSON body formatter
- Pretty, raw, and headers response views
- Status, time, and response size metrics
- Saved requests and request history in `localStorage`
- Simple environment variables with `{{name}}` placeholders

## Run

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Notes

- Browser CORS rules still apply. Public APIs that do not allow browser requests may fail even when the same request works in the desktop Postman app.
- Environment variables are entered as `key=value` pairs separated by semicolons, for example `baseUrl=https://api.example.com; token=abc123`.
