import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize, readJson, type NormalizedRecord, type RawDownload } from "./lib.js";
const records = existsSync(resolve("data/noaa-normalized.json")) ? await readJson<NormalizedRecord[]>(resolve("data/noaa-normalized.json")) : normalize(await readJson<RawDownload>(resolve("data/noaa-fixture.json")));
const cities = [...new Set(records.map((r) => r.city))]; const dates = records.map((r) => r.date); const metrics = [...new Set(records.map((r) => r.metric))];
console.log(JSON.stringify({ records: records.length, cities, minDate: dates.sort()[0], maxDate: dates.sort().at(-1), metrics }, null, 2));
