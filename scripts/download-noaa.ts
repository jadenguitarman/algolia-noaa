import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { dateRange, cities, source, type RawDownload, type RawObservation, type Station, readJson, writeJson } from "./lib.js";

const token = process.env.NOAA_CDO_TOKEN || "";
const userAgent = process.env.NOAA_USER_AGENT || "algolia-noaa-weather-demo/1.0 (https://github.com/jadenguitarman/algolia-noaa)";
if (!token) throw new Error("NOAA_CDO_TOKEN is required by the NOAA CDO v2 API. NOAA_USER_AGENT is also sent with every request.");
const base = "https://www.ncei.noaa.gov/cdo-web/api/v2";

async function getJson<T>(url: string, attempt = 0): Promise<T> {
  const headers: Record<string, string> = { "user-agent": userAgent, token };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if ((response.status === 429 || response.status >= 500) && attempt < 4) { await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** attempt)); return getJson<T>(url, attempt + 1); }
  if (!response.ok) throw new Error(`NOAA request failed (${response.status}): ${await response.text()}`);
  return response.json() as Promise<T>;
}

async function cachedJson<T>(cacheFile: string, url: string): Promise<T> {
  if (existsSync(resolve(cacheFile))) return readJson<T>(resolve(cacheFile));
  const value = await getJson<T>(url);
  await writeJson(resolve(cacheFile), value);
  return value;
}

async function pagedData(stationId: string): Promise<RawObservation[]> {
  const rows: RawObservation[] = []; let offset = 1; const limit = 1000;
  while (true) {
    const params = new URLSearchParams({ datasetid: "GHCND", stationid: stationId, startdate: dateRange.start, enddate: dateRange.end, datatypeid: "TMAX,TMIN,PRCP", units: "metric", limit: String(limit), offset: String(offset) });
    const page = await cachedJson<{ results?: Array<{ date: string; datatype: string; value: number }> }>(`data/.cache/noaa/${stationId.replaceAll(":", "_")}_${offset}.json`, `${base}/data?${params}`);
    const results = page.results ?? []; rows.push(...results.map((r) => ({ city: "", station: {} as Station, date: r.date.slice(0, 10), datatype: r.datatype, value: r.value })));
    if (results.length < limit) break; offset += limit; await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return rows;
}

const output: RawDownload = { source, dataset: "GHCND", startDate: dateRange.start, endDate: dateRange.end, cities: [] };
for (const city of cities) {
  const params = new URLSearchParams({ datasetid: "GHCND", locationid: city.locationId, limit: "1000", sortfield: "datacoverage", sortorder: "desc" });
  const stationResponse = await cachedJson<{ results?: Array<{ id: string; name: string; latitude: number; longitude: number; elevation?: number; datacoverage?: number }> }>(`data/.cache/noaa/stations_${city.name.toLowerCase().replaceAll(" ", "_")}.json`, `${base}/stations?${params}`);
  const candidates = stationResponse.results ?? [];
  const preferred = city.preferredStationIds.flatMap((id) => candidates.filter((candidate) => candidate.id === id));
  const remaining = candidates.filter((candidate) => !city.preferredStationIds.includes(candidate.id));
  let selected: { station: Station; observations: RawObservation[] } | undefined;
  for (const stationRow of [...preferred, ...remaining]) {
    const station: Station = { ...stationRow };
    const observations = await pagedData(station.id);
    if (observations.length > 0) {
      selected = { station, observations };
      break;
    }
  }
  if (!selected) throw new Error(`No GHCND station with TMAX/TMIN/PRCP observations found for ${city.name}`);
  output.cities.push({ city: city.name, station: selected.station, observations: selected.observations.map((row) => ({ ...row, city: city.name, station: selected.station })) });
  console.log(`${city.name}: ${selected.station.id}, ${selected.observations.length} observations`);
}
await writeJson(resolve("data/noaa-raw.json"), output);
console.log("Wrote data/noaa-raw.json");
