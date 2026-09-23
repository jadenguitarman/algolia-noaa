import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { writeJson, source, type RawDownload, type RawObservation, type Station } from "./lib.js";

const rawPath = resolve("data/noaa-raw.json");
if (existsSync(rawPath)) {
  const raw = JSON.parse(await readFile(rawPath, "utf8")) as RawDownload;
  const fixture: RawDownload = {
    source: raw.source,
    dataset: raw.dataset,
    startDate: raw.startDate,
    endDate: raw.endDate,
    cities: raw.cities.map(({ city, station, observations }) => {
      const seen = new Set<string>();
      const sampled = observations.filter((observation) => {
        const key = `${observation.date.slice(0, 7)}:${observation.datatype}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      console.log(`${city}: ${sampled.length} fixture observations`);
      return { city, station, observations: sampled };
    }),
  };
  await writeJson(resolve("data/noaa-fixture.json"), fixture);
  console.log("Wrote data/noaa-fixture.json from the live raw download");
  process.exit(0);
}

const inputs = [
  { city: "New York City", file: "data/.download/ny.csv", id: "GHCND:USW00094728", name: "NEW YORK CENTRAL PARK, NY US", latitude: 40.7789, longitude: -73.9692, elevation: 42.7 },
  { city: "Chicago", file: "data/.download/chicago.csv", id: "GHCND:USW00094846", name: "CHICAGO OHARE INTERNATIONAL AIRPORT, IL US", latitude: 41.995, longitude: -87.9336, elevation: 201.2 },
  { city: "San Francisco", file: "data/.download/sf.csv", id: "GHCND:USW00023272", name: "SAN FRANCISCO INTERNATIONAL AIRPORT, CA US", latitude: 37.6197, longitude: -122.365, elevation: 4.6 },
];
const wanted = new Set(["PRCP", "TMAX", "TMIN"]);
function parseCsvLine(line: string) { const cells: string[] = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i++) { const char = line[i]; if (char === '"' && line[i + 1] === '"') { value += '"'; i++; } else if (char === '"') quoted = !quoted; else if (char === "," && !quoted) { cells.push(value); value = ""; } else value += char; } cells.push(value); return cells; }
const output: RawDownload = { source, dataset: "GHCND", startDate: "2024-01-01", endDate: "2024-12-31", cities: [] };
for (const input of inputs) {
  const station: Station = { id: input.id, name: input.name, latitude: input.latitude, longitude: input.longitude, elevation: input.elevation };
  const lines = (await readFile(resolve(input.file), "utf8")).split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines.shift()!);
  const index = Object.fromEntries(header.map((name, i) => [name, i]));
  const seen = new Set<string>(); const observations: RawObservation[] = [];
  for (const line of lines) {
    const cells = parseCsvLine(line); const date = cells[index.DATE]?.slice(0, 10); if (!date?.startsWith("2024-")) continue;
    for (const datatype of wanted) {
      const raw = cells[index[datatype]]; if (!raw || raw === "-9999") continue;
      const month = date.slice(0, 7); const key = `${month}:${datatype}`; if (seen.has(key)) continue;
      seen.add(key); observations.push({ city: input.city, station, date, datatype, value: Number(raw) / 10, rawValue: Number(raw), rawUnit: datatype === "PRCP" ? "tenths of mm" : "tenths of °C" });
    }
  }
  output.cities.push({ city: input.city, station, observations });
  console.log(`${input.city}: ${observations.length} fixture observations`);
}
await writeJson(resolve("data/noaa-fixture.json"), output);
