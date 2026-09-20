import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { normalize, readJson, writeJson, type RawDownload } from "./lib.js";

const input = existsSync(resolve("data/noaa-raw.json")) ? "data/noaa-raw.json" : "data/noaa-fixture.json";
const raw = await readJson<RawDownload>(resolve(input));
const records = normalize(raw);
if (!records.length) throw new Error("No supported NOAA observations found.");
await writeJson(resolve("data/noaa-normalized.json"), records);
console.log(`Normalized ${records.length} observations from ${input}`);
