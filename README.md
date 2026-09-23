# NOAA Weather Expert

A small React + TypeScript + Vite demo for asking grounded questions about historical NOAA observations. It uses Algolia Agent Studio's React InstantSearch `Chat` widget over a `noaa_weather_demo` index.

The tracked fixture contains real GHCND observations sampled from the first available day of each month in 2024 for seven major US cities. A live CDO download produces the complete daily 2024 dataset.

## Setup

```bash
npm install
cp .env.example .env.local
```

Browser variables in `.env.local`:

```bash
VITE_ALGOLIA_APP_ID=<the existing noaa application id>
VITE_ALGOLIA_SEARCH_API_KEY=<search-only key>
VITE_ALGOLIA_INDEX_NAME=noaa_weather_demo
VITE_ALGOLIA_AGENT_ID=<published Agent Studio agent UUID>
```

Keep `ALGOLIA_ADMIN_API_KEY`, `NOAA_USER_AGENT`, and any `NOAA_CDO_TOKEN` local-only. They must never be placed in `VITE_*` variables or committed.

## NOAA data workflow

For the complete dataset, set a NOAA CDO token and descriptive User-Agent, then run:

```bash
export NOAA_USER_AGENT='algolia-noaa-weather-demo/1.0 (https://github.com/jadenguitarman/algolia-noaa)'
export NOAA_CDO_TOKEN='<NOAA CDO token>'
npm run download
npm run normalize
npm run coverage
```

The CDO v2 endpoint requires the token; the downloader also sends the User-Agent on every request. Keep both values local-only.

The downloader resolves GHCND stations through the CDO station endpoint for each configured FIPS location, prefers known high-coverage stations, and falls back to the next candidate with actual TMAX/TMIN/PRCP observations. It requests the metrics with pagination, caches the raw response locally, applies bounded retries for 429/5xx responses, and waits between pages. The raw download is ignored by Git. The normalizer preserves the source value and raw unit, then adds Fahrenheit or inches fields plus searchable descriptive text. It also creates complete-month aggregate records derived from the daily rows: monthly precipitation totals and monthly average TMAX/TMIN values. Partial months do not receive aggregates, so the agent cannot mistake incomplete coverage for a complete period.

If live download is unavailable, `npm run normalize` uses the tracked `data/noaa-fixture.json` fixture.

## Seed Algolia

Use the existing Algolia application called `noaa`; do not create another application. Set local-only values, then run:

```bash
ALGOLIA_APP_ID=<existing noaa app id> \
ALGOLIA_ADMIN_API_KEY=<admin key, local only> \
npm run seed
```

The seeder creates/updates `noaa_weather_demo`, configures searchable attributes and facets (including `recordType`, `aggregation`, and `coverageComplete`), adds numeric filtering attributes, uploads daily and monthly records in batches, and prints the indexed record count. Verify that count in the Algolia dashboard before publishing the agent.

## Agent Studio

Follow [`agent-studio-instructions.md`](./agent-studio-instructions.md) to create and publish `NOAA Weather Expert` using the seeded index. Use an already-authorized built-in provider. Never add a credential to this repository. After publishing, set `VITE_ALGOLIA_AGENT_ID` and run:

```bash
npm run evaluate
```

The evaluation includes a regression for “Which city had the most precipitation in March 2024?” and checks that the answer identifies New York City and the monthly aggregate value from the indexed records, rather than a single-day value.

For local user-authenticated evaluation, also set `ALGOLIA_AGENT_USER_AUTH_KEY` in `.env.local`. The evaluator resolves its Agent Studio secret-key ID with the local Admin key, mints a short-lived secure-user JWT, and sends it as `X-Algolia-Secure-User-Token`. Never put this key or JWT in `VITE_*` variables or the public deployment.

## Local development and build

```bash
npm run dev
npm run build
npm run preview
```

The UI has coverage, source, loading/error/no-configuration messaging, responsive layout, example prompts, and an explicit historical-observation/not-a-forecast boundary. Example prompts send questions directly to the embedded Chat experience.

## Deployment

Create a Vercel project named `algolia-noaa`, set the four `VITE_*` variables in the project environment, and deploy with `npm run build` and `dist`. Do not add admin, NOAA, Vercel, or provider secrets to the public project.
