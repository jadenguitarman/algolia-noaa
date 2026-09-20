# NOAA Weather Expert

A small React + TypeScript + Vite demo for asking grounded questions about historical NOAA observations. It uses Algolia Agent Studio's React InstantSearch `Chat` widget over a `noaa_weather_demo` index.

The tracked fixture contains real GHCND observations sampled from the first available day of each month in 2024 for three representative stations. A live CDO download produces the complete daily 2024 dataset.

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

Keep `ALGOLIA_ADMIN_API_KEY` and `NOAA_CDO_TOKEN` local-only. They must never be placed in `VITE_*` variables or committed.

## NOAA data workflow

For the complete dataset, add a NOAA CDO API token to the shell environment and run:

```bash
npm run download
npm run normalize
npm run coverage
```

The downloader resolves a GHCND station through the CDO station endpoint for each configured FIPS location, requests TMAX/TMIN/PRCP with pagination, caches the raw response locally, applies bounded retries for 429/5xx responses, and waits between pages. The raw download is ignored by Git. The normalizer preserves the source value and raw unit, then adds Fahrenheit or inches fields plus searchable descriptive text.

Without a token, `npm run normalize` uses the tracked `data/noaa-fixture.json` fixture.

## Seed Algolia

Use the existing Algolia application called `noaa`; do not create another application. Set local-only values, then run:

```bash
ALGOLIA_APP_ID=<existing noaa app id> \
ALGOLIA_ADMIN_API_KEY=<admin key, local only> \
npm run seed
```

The seeder creates/updates `noaa_weather_demo`, configures searchable attributes and facets, adds numeric filtering attributes, uploads records in batches, and prints the indexed record count. Verify that count in the Algolia dashboard before publishing the agent.

## Agent Studio

Follow [`agent-studio-instructions.md`](./agent-studio-instructions.md) to create and publish `NOAA Weather Expert` using the seeded index. Use an already-authorized built-in provider. Never add a credential to this repository. After publishing, set `VITE_ALGOLIA_AGENT_ID` and run:

```bash
npm run evaluate
```

The evaluation sends representative location, date-range, comparison, and out-of-coverage prompts to the published completion endpoint and checks for required grounding terms.

## Local development and build

```bash
npm run dev
npm run build
npm run preview
```

The UI has coverage, source, loading/error/no-configuration messaging, responsive layout, example prompts, and an explicit historical-observation/not-a-forecast boundary. Example prompts populate the InstantSearch query; use the Chat/AI Mode control to send them.

## Deployment

Create a Vercel project named `algolia-noaa`, set the four `VITE_*` variables in the project environment, and deploy with `npm run build` and `dist`. Do not add admin, NOAA, Vercel, or provider secrets to the public project.
