import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize, readJson, type NormalizedRecord, type RawDownload } from "./lib.js";

const appId = process.env.ALGOLIA_APP_ID;
const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
const indexName = process.env.VITE_ALGOLIA_INDEX_NAME ?? "";
if (!appId || !adminKey || !indexName) throw new Error("ALGOLIA_APP_ID, ALGOLIA_ADMIN_API_KEY, and VITE_ALGOLIA_INDEX_NAME are required. The seeder uses the same VITE_ALGOLIA_INDEX_NAME as the browser demo.");
const headers = { "content-type": "application/json", "x-algolia-application-id": appId, "x-algolia-api-key": adminKey };
const base = `https://${appId}-dsn.algolia.net`;
const records = existsSync(resolve("data/noaa-normalized.json")) ? await readJson<NormalizedRecord[]>(resolve("data/noaa-normalized.json")) : normalize(await readJson<RawDownload>(resolve("data/noaa-fixture.json")));
if (!records.length) throw new Error("No records available to seed.");

async function request(path: string, init: RequestInit = {}) { const response = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } }); if (!response.ok) throw new Error(`Algolia ${response.status}: ${await response.text()}`); return response.json() as Promise<any>; }
async function waitForTask(taskId: number) { for (let attempt = 0; attempt < 24; attempt++) { const task = await request(`/1/indexes/${encodeURIComponent(indexName)}/task/${taskId}`); if (task.status === "published") return; await new Promise((resolve) => setTimeout(resolve, 250)); } throw new Error(`Algolia task ${taskId} did not publish within the bounded wait.`); }
await request(`/1/indexes/${encodeURIComponent(indexName)}/settings`, { method: "PUT", body: JSON.stringify({ searchableAttributes: ["station", "city", "metric", "date", "descriptiveText"], attributesForFaceting: ["searchable(station)", "searchable(city)", "year", "month", "searchable(metric)", "metricCode", "unit"], numericAttributesForFiltering: ["value", "rawValue", "dateNumeric", "year", "month", "latitude", "longitude"], customRanking: ["desc(dateNumeric)"], unretrievableAttributes: [] }) });
const clearResult = await request(`/1/indexes/${encodeURIComponent(indexName)}/clear`, { method: "POST" });
if (clearResult.taskID) await waitForTask(clearResult.taskID);
for (let i = 0; i < records.length; i += 1000) { const batch = records.slice(i, i + 1000); const result = await request(`/1/indexes/${encodeURIComponent(indexName)}/batch`, { method: "POST", body: JSON.stringify({ requests: batch.map((record) => ({ action: "updateObject", body: record })) }) }); if (result.taskID) await waitForTask(result.taskID); console.log(`Seeded ${Math.min(i + batch.length, records.length)}/${records.length}`); }
const settings = await request(`/1/indexes/${encodeURIComponent(indexName)}/settings`);
const verification = await request(`/1/indexes/${encodeURIComponent(indexName)}/query`, { method: "POST", body: JSON.stringify({ params: "query=&hitsPerPage=0" }) });
console.log(`Index ${indexName} seeded with ${verification.nbHits} records. searchableAttributes=${JSON.stringify(settings.searchableAttributes)}`);
