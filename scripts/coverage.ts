import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { addMonthlyAggregates, normalize, readJson, type NormalizedRecord, type RawDownload } from "./lib.js";
const records = existsSync(resolve("data/noaa-normalized.json")) ? await readJson<NormalizedRecord[]>(resolve("data/noaa-normalized.json")) : addMonthlyAggregates(normalize(await readJson<RawDownload>(resolve("data/noaa-fixture.json"))));
const dailyRecords = records.filter((r) => r.recordType === "daily"); const aggregateRecords = records.filter((r) => r.recordType === "monthly_aggregate");
const cities = [...new Set(dailyRecords.map((r) => r.city))]; const dates = dailyRecords.map((r) => r.date); const metrics = [...new Set(dailyRecords.map((r) => r.metric))];
console.log(JSON.stringify({ records: records.length, dailyRecords: dailyRecords.length, monthlyAggregates: aggregateRecords.length, cities, minDate: dates.sort()[0], maxDate: dates.sort().at(-1), metrics }, null, 2));
