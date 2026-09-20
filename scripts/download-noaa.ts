import { resolve } from "node:path";
import { dateRange, cities, source, type RawDownload, type RawObservation, type Station, writeJson } from "./lib.js";

const token = process.env.NOAA_CDO_TOKEN;
if (!token) throw new Error("NOAA_CDO_TOKEN is required for a live download. Use the tracked fixture for offline work.");
const base = "https://www.ncei.noaa.gov/cdo-web/api/v2";

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  if (!token) throw new Error("NOAA_CDO_TOKEN is required.");
  const response = await fetch(url, { headers: { token, "user-agent": "algolia-noaa-demo/1.0" }, signal: AbortSignal.timeout(30_000) });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); return getJson<T>(url, attempt + 1); }
  if (!response.ok) throw new Error(`NOAA request failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function pagedData(stationId: string): Promise<RawObservation[]> {
  const rows: RawObservation[] = []; let offset = 1; const limit = 1000;
  while (true) {
    const params = new URLSearchParams({ datasetid: "GHCND", stationid: stationId, startdate: dateRange.start, enddate: dateRange.end, datatypeid: "TMAX,TMIN,PRCP", units: "metric", limit: String(limit), offset: String(offset) });
    const page = await getJson<{ results?: Array<{ date: string; datatype: string; value: number }> }>(`${base}/data?${params}`);
    const results = page.results ?? []; rows.push(...results.map((r) => ({ city: "", station: {} as Station, date: r.date.slice(0, 10), datatype: r.datatype, value: r.value })));
    if (results.length < limit) break; offset += limit; await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return rows;
}

const output: RawDownload = { source, dataset: "GHCND", startDate: dateRange.start, endDate: dateRange.end, cities: [] };
for (const city of cities) {
  const params = new URLSearchParams({ datasetid: "GHCND", locationid: city.locationId, limit: "1000", sortfield: "datacoverage", sortorder: "desc" });
  const stationResponse = await getJson<{ results?: Array<{ id: string; name: string; latitude: number; longitude: number; elevation?: number; datacoverage?: number }> }>(`${base}/stations?${params}`);
  const stationRow = stationResponse.results?.[0]; if (!stationRow) throw new Error(`No GHCND station found for ${city.name}`);
  const station: Station = { ...stationRow };
  const observations = await pagedData(station.id);
  output.cities.push({ city: city.name, station, observations: observations.map((row) => ({ ...row, city: city.name, station })) });
  console.log(`${city.name}: ${station.id}, ${observations.length} observations`);
}
await writeJson(resolve("data/noaa-raw.json"), output);
console.log("Wrote data/noaa-raw.json");
