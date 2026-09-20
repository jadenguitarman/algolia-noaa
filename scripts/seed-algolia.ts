import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize, readJson, type NormalizedRecord, type RawDownload } from "./lib.js";

const appId = process.env.ALGOLIA_APP_ID;
const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
const indexName = process.env.ALGOLIA_INDEX_NAME || "noaa_weather_demo";
if (!appId || !adminKey) throw new Error("ALGOLIA_APP_ID and ALGOLIA_ADMIN_API_KEY are required. These are server/local-only values.");
const headers = { "content-type": "application/json", "x-algolia-application-id": appId, "x-algolia-api-key": adminKey };
const base = `https://${appId}-dsn.algolia.net`;
const records = existsSync(resolve("data/noaa-normalized.json")) ? await readJson<NormalizedRecord[]>(resolve("data/noaa-normalized.json")) : normalize(await readJson<RawDownload>(resolve("data/noaa-fixture.json")));
if (!records.length) throw new Error("No records available to seed.");

async function request(path: string, init: RequestInit = {}) { const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }); if (!response.ok) throw new Error(`Algolia ${response.status}: ${await response.text()}`); return response.json() as Promise<any>; }
await request(`/1/indexes/${encodeURIComponent(indexName)}/settings`, { method: "PUT", body: JSON.stringify({ searchableAttributes: ["station", "city", "metric", "date", "descriptiveText"], attributesForFaceting: ["searchable(station)", "searchable(city)", "year", "month", "searchable(metric)", "metricCode", "unit"], numericAttributesForFiltering: ["value", "rawValue", "dateNumeric", "year", "month", "latitude", "longitude"], customRanking: ["desc(dateNumeric)"], unretrievableAttributes: [] }) });
for (let i = 0; i < records.length; i += 1000) { const batch = records.slice(i, i + 1000); const result = await request(`/1/indexes/${encodeURIComponent(indexName)}/batch`, { method: "POST", body: JSON.stringify({ requests: batch.map((record) => ({ action: "updateObject", body: record })) }) }); if (result.taskID) await request(`/1/indexes/${encodeURIComponent(indexName)}/task/${result.taskID}`); console.log(`Seeded ${Math.min(i + batch.length, records.length)}/${records.length}`); }
const count = await request(`/1/indexes/${encodeURIComponent(indexName)}/settings`);
console.log(`Index ${indexName} seeded with ${records.length} records. searchableAttributes=${JSON.stringify(count.searchableAttributes)}`);
