import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type City = { name: string; locationId: string; aliases: string[]; preferredStationIds: string[] };
export type Station = { id: string; name: string; latitude: number; longitude: number; elevation?: number; datacoverage?: number };
export type RawObservation = { city: string; station: Station; date: string; datatype: string; value: number; rawValue?: number; rawUnit?: string };
export type RawDownload = { source: string; dataset: string; startDate: string; endDate: string; cities: Array<{ city: string; station: Station; observations: RawObservation[] }> };
export type NormalizedRecord = {
  objectID: string; station: string; stationId: string; city: string; date: string; dateNumeric: number; year: number; month: number; metric: string; metricCode: string; value: number; unit: string; rawValue: number; rawUnit: string; normalizedFahrenheit?: number; normalizedInches?: number; latitude: number; longitude: number; source: string; sourceDataset: string; descriptiveText: string; recordType: "daily" | "monthly_aggregate"; aggregation: "daily" | "monthly_total" | "monthly_average"; aggregationPriority: number; observationCount: number; coverageComplete: boolean; dateRange: string;
};

export const cities: City[] = [
  { name: "New York City", locationId: "FIPS:36061", aliases: ["New York", "NYC", "Manhattan"], preferredStationIds: ["GHCND:USW00094728"] },
  { name: "Chicago", locationId: "FIPS:17031", aliases: [], preferredStationIds: ["GHCND:USW00014819", "GHCND:USW00094846"] },
  { name: "San Francisco", locationId: "FIPS:06075", aliases: ["SF"], preferredStationIds: ["GHCND:USW00023272"] },
  { name: "Los Angeles", locationId: "FIPS:06037", aliases: ["LA"], preferredStationIds: ["GHCND:USW00023174"] },
  { name: "Boston", locationId: "FIPS:25025", aliases: [], preferredStationIds: ["GHCND:USW00014739"] },
  { name: "Seattle", locationId: "FIPS:53033", aliases: [], preferredStationIds: ["GHCND:USW00024233"] },
  { name: "Denver", locationId: "FIPS:08031", aliases: [], preferredStationIds: ["GHCND:USW00023062"] },
];
export const dateRange = { start: "2024-01-01", end: "2024-12-31" };
export const source = "NOAA Climate Data Online (CDO) API · GHCND daily summaries";

export async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, "utf8")) as T; }
export async function writeJson(path: string, value: unknown) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, JSON.stringify(value, null, 2) + "\n", "utf8"); }
export function cToF(value: number) { return value * 9 / 5 + 32; }
export function mmToInches(value: number) { return value / 25.4; }

export function normalize(raw: RawDownload): NormalizedRecord[] {
  const labels: Record<string, { metric: string; unit: string; rawUnit: string }> = {
    TMAX: { metric: "daily maximum temperature", unit: "°F", rawUnit: "°C" },
    TMIN: { metric: "daily minimum temperature", unit: "°F", rawUnit: "°C" },
    PRCP: { metric: "precipitation", unit: "in", rawUnit: "mm" },
  };
  return raw.cities.flatMap(({ city, station, observations }) => observations.flatMap((observation) => {
    const label = labels[observation.datatype]; if (!label || !Number.isFinite(observation.value)) return [];
    const value = observation.datatype === "PRCP" ? mmToInches(observation.value) : cToF(observation.value);
    const dateNumeric = Number(observation.date.replaceAll("-", ""));
    return [{
      objectID: `${station.id.replaceAll(":", "_")}_${observation.date}_${observation.datatype}`,
      station: station.name, stationId: station.id, city, date: observation.date, dateNumeric,
      year: Number(observation.date.slice(0, 4)), month: Number(observation.date.slice(5, 7)),
      metric: label.metric, metricCode: observation.datatype, value: Number(value.toFixed(3)), unit: label.unit,
      rawValue: observation.rawValue ?? observation.value, rawUnit: observation.rawUnit ?? label.rawUnit,
      ...(observation.datatype === "PRCP" ? { normalizedInches: Number(value.toFixed(3)) } : { normalizedFahrenheit: Number(value.toFixed(2)) }),
      latitude: station.latitude, longitude: station.longitude, source, sourceDataset: raw.dataset,
      descriptiveText: `${city} at ${station.name} on ${observation.date}: ${label.metric} ${value.toFixed(2)} ${label.unit}. NOAA GHCND historical observation.`,
      recordType: "daily", aggregation: "daily", aggregationPriority: 0, observationCount: 1, coverageComplete: true, dateRange: observation.date,
    }];
  }));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/**
 * Add complete-month summaries derived only from the normalized daily NOAA rows.
 * Partial months intentionally produce no aggregate so the agent cannot present
 * an incomplete total or average as a complete monthly answer.
 */
export function addMonthlyAggregates(dailyRecords: NormalizedRecord[]): NormalizedRecord[] {
  const groups = new Map<string, NormalizedRecord[]>();
  for (const record of dailyRecords) {
    if (record.recordType !== "daily") continue;
    const key = `${record.stationId}|${record.year}|${record.month}|${record.metricCode}`;
    const group = groups.get(key) || [];
    group.push(record);
    groups.set(key, group);
  }

  const aggregates: NormalizedRecord[] = [];
  for (const records of groups.values()) {
    const first = records[0];
    const expectedDays = daysInMonth(first.year, first.month);
    if (records.length !== expectedDays) continue;

    const month = String(first.month).padStart(2, "0");
    const monthStart = `${first.year}-${month}-01`;
    const monthEnd = `${first.year}-${month}-${String(expectedDays).padStart(2, "0")}`;
    const label = monthLabel(first.year, first.month);
    const rawTotal = records.reduce((sum, record) => sum + record.rawValue, 0);
    const rawAverage = rawTotal / records.length;
    const isPrecipitation = first.metricCode === "PRCP";
    const value = isPrecipitation ? mmToInches(rawTotal) : cToF(rawAverage);
    const normalizedValue = Number(value.toFixed(isPrecipitation ? 3 : 2));
    const aggregateLabel = isPrecipitation ? "monthly precipitation total" : `monthly average ${first.metric}`;
    const aggregation: "monthly_total" | "monthly_average" = isPrecipitation ? "monthly_total" : "monthly_average";

    aggregates.push({
      ...first,
      objectID: `${first.stationId.replaceAll(":", "_")}_${first.year}-${month}_${first.metricCode}_${aggregation}`,
      date: `${first.year}-${month}`,
      dateNumeric: Number(`${first.year}${month}`),
      metric: first.metric,
      value: normalizedValue,
      rawValue: Number((isPrecipitation ? rawTotal : rawAverage).toFixed(3)),
      ...(isPrecipitation ? { normalizedInches: normalizedValue, normalizedFahrenheit: undefined } : { normalizedFahrenheit: normalizedValue, normalizedInches: undefined }),
      recordType: "monthly_aggregate",
      aggregation,
      aggregationPriority: 1,
      observationCount: records.length,
      coverageComplete: true,
      dateRange: `${monthStart} to ${monthEnd}`,
      descriptiveText: `${first.city} at ${first.station}: ${aggregateLabel} for ${label} ${first.year}, based on ${records.length} complete daily ${first.metricCode} observations: ${normalizedValue.toFixed(isPrecipitation ? 3 : 2)} ${first.unit}. NOAA GHCND historical aggregate derived from indexed daily observations.`,
    });
  }

  return [...dailyRecords, ...aggregates];
}
