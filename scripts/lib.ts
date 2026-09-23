import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type City = { name: string; locationId: string; aliases: string[]; preferredStationIds: string[] };
export type Station = { id: string; name: string; latitude: number; longitude: number; elevation?: number; datacoverage?: number };
export type RawObservation = { city: string; station: Station; date: string; datatype: string; value: number; rawValue?: number; rawUnit?: string };
export type RawDownload = { source: string; dataset: string; startDate: string; endDate: string; cities: Array<{ city: string; station: Station; observations: RawObservation[] }> };
export type NormalizedRecord = {
  objectID: string; station: string; stationId: string; city: string; date: string; dateNumeric: number; year: number; month: number; metric: string; metricCode: string; value: number; unit: string; rawValue: number; rawUnit: string; normalizedFahrenheit?: number; normalizedInches?: number; latitude: number; longitude: number; source: string; sourceDataset: string; descriptiveText: string; recordType: "daily" | "aggregate" | "monthly_aggregate"; aggregation: string; aggregationPriority: number; observationCount: number; expectedObservationCount?: number; coverageRatio?: number; coverageComplete: boolean; dateRange: string; weekday?: string; weekdayNumber?: number; isWeekend?: boolean; dayOfYear?: number; quarter?: string; season?: string; aggregationDimension?: string; aggregationValue?: string; threshold?: number; thresholdLabel?: string; extremeDate?: string; eventStartDate?: string; eventEndDate?: string; derivedFrom?: string;
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

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const seasons = ["winter", "spring", "summer", "autumn"] as const;
type Season = typeof seasons[number];

function getDateMetadata(dateString: string) {
  const date = new Date(`${dateString}T00:00:00Z`);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const weekdayNumber = date.getUTCDay();
  const startOfYear = Date.UTC(year, 0, 1);
  const dayOfYear = Math.floor((date.getTime() - startOfYear) / 86_400_000) + 1;
  const quarter = `Q${Math.ceil(month / 3)}`;
  const season: Season = month === 12 || month <= 2 ? "winter" : month <= 5 ? "spring" : month <= 8 ? "summer" : "autumn";
  return { weekday: weekdays[weekdayNumber], weekdayNumber, isWeekend: weekdayNumber === 0 || weekdayNumber === 6, dayOfYear, quarter, season };
}

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
    const dateMetadata = getDateMetadata(observation.date);
    return [{
      objectID: `${station.id.replaceAll(":", "_")}_${observation.date}_${observation.datatype}`,
      station: station.name, stationId: station.id, city, date: observation.date, dateNumeric,
      year: Number(observation.date.slice(0, 4)), month: Number(observation.date.slice(5, 7)),
      metric: label.metric, metricCode: observation.datatype, value: Number(value.toFixed(3)), unit: label.unit,
      rawValue: observation.rawValue ?? observation.value, rawUnit: observation.rawUnit ?? label.rawUnit,
      ...(observation.datatype === "PRCP" ? { normalizedInches: Number(value.toFixed(3)) } : { normalizedFahrenheit: Number(value.toFixed(2)) }),
      latitude: station.latitude, longitude: station.longitude, source, sourceDataset: raw.dataset,
      descriptiveText: `${city} at ${station.name} on ${observation.date}: ${label.metric} ${value.toFixed(2)} ${label.unit}. NOAA GHCND historical observation.`,
      ...dateMetadata, recordType: "daily", aggregation: "daily", aggregationPriority: 0, observationCount: 1, coverageComplete: true, dateRange: observation.date,
    }];
  }));
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function monthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function uniqueDates(records: NormalizedRecord[]) { return new Set(records.map((record) => record.date)).size; }
function isComplete(records: NormalizedRecord[], expected: number) { return records.length === expected && uniqueDates(records) === expected; }
function groupRecords(records: NormalizedRecord[], keyFor: (record: NormalizedRecord) => string) {
  const groups = new Map<string, NormalizedRecord[]>();
  for (const record of records) {
    const group = groups.get(keyFor(record)) || [];
    group.push(record);
    groups.set(keyFor(record), group);
  }
  return groups;
}

function expectedWeekdayCount(year: number, weekdayNumber: number) {
  let count = 0;
  for (let day = 1; day <= daysInMonth(year, 12) + 335; day++) {
    const date = new Date(Date.UTC(year, 0, day));
    if (date.getUTCFullYear() !== year) break;
    if (date.getUTCDay() === weekdayNumber) count++;
  }
  return count;
}

function expectedSeasonDays(year: number, season: Season) {
  let count = 0;
  for (let day = 1; day <= 366; day++) {
    const date = new Date(Date.UTC(year, 0, day));
    if (date.getUTCFullYear() !== year) break;
    if (getDateMetadata(date.toISOString().slice(0, 10)).season === season) count++;
  }
  return count;
}

type AggregateOptions = {
  objectIDSuffix: string;
  aggregation: string;
  aggregationDimension: string;
  aggregationValue: string;
  date: string;
  dateNumeric: number;
  month: number;
  metric: string;
  metricCode: string;
  value: number;
  unit: string;
  rawValue: number;
  rawUnit: string;
  dateRange: string;
  observationCount: number;
  expectedObservationCount: number;
  description: string;
  recordType?: "aggregate" | "monthly_aggregate";
  weekday?: string;
  weekdayNumber?: number;
  quarter?: string;
  season?: string;
  threshold?: number;
  thresholdLabel?: string;
  extremeDate?: string;
  eventStartDate?: string;
  eventEndDate?: string;
};

function makeAggregate(first: NormalizedRecord, options: AggregateOptions): NormalizedRecord {
  const roundedValue = Number(options.value.toFixed(options.unit === "°F" ? 2 : options.unit === "in" ? 3 : 0));
  const normalizedFields = options.unit === "°F" ? { normalizedFahrenheit: roundedValue } : options.unit === "in" ? { normalizedInches: roundedValue } : {};
  return {
    objectID: `${first.stationId.replaceAll(":", "_")}_${options.objectIDSuffix}`,
    station: first.station, stationId: first.stationId, city: first.city, date: options.date, dateNumeric: options.dateNumeric,
    year: first.year, month: options.month, metric: options.metric, metricCode: options.metricCode, value: roundedValue,
    unit: options.unit, rawValue: Number(options.rawValue.toFixed(3)), rawUnit: options.rawUnit, ...normalizedFields,
    latitude: first.latitude, longitude: first.longitude, source: first.source, sourceDataset: first.sourceDataset,
    descriptiveText: options.description, recordType: options.recordType || "aggregate", aggregation: options.aggregation,
    aggregationPriority: 1, observationCount: options.observationCount, expectedObservationCount: options.expectedObservationCount,
    coverageRatio: Number((options.observationCount / options.expectedObservationCount).toFixed(4)), coverageComplete: options.observationCount === options.expectedObservationCount,
    dateRange: options.dateRange, weekday: options.weekday, weekdayNumber: options.weekdayNumber, quarter: options.quarter, season: options.season,
    aggregationDimension: options.aggregationDimension, aggregationValue: options.aggregationValue, threshold: options.threshold,
    thresholdLabel: options.thresholdLabel, extremeDate: options.extremeDate, eventStartDate: options.eventStartDate, eventEndDate: options.eventEndDate,
    derivedFrom: "Indexed NOAA GHCND daily observations",
  };
}

function metricSummary(records: NormalizedRecord[], aggregation: "average" | "total") {
  const first = records[0];
  const rawTotal = records.reduce((sum, record) => sum + record.rawValue, 0);
  const rawAverage = rawTotal / records.length;
  const isPrecipitation = first.metricCode === "PRCP";
  const isTemperatureRange = first.metricCode === "DTR";
  return {
    value: isPrecipitation ? mmToInches(aggregation === "total" ? rawTotal : rawAverage) : isTemperatureRange ? rawAverage : cToF(rawAverage),
    rawValue: isPrecipitation && aggregation === "total" ? rawTotal : rawAverage,
    unit: isPrecipitation ? "in" : "°F",
    rawUnit: isPrecipitation ? "mm" : isTemperatureRange ? "°F" : "°C",
  };
}

function addAggregateGroup(output: NormalizedRecord[], records: NormalizedRecord[], expected: number, options: Omit<AggregateOptions, "value" | "rawValue" | "unit" | "rawUnit" | "observationCount" | "expectedObservationCount"> & { summary: "average" | "total" }) {
  if (!isComplete(records, expected)) return;
  const summary = metricSummary(records, options.summary);
  output.push(makeAggregate(records[0], { ...options, ...summary, observationCount: records.length, expectedObservationCount: expected, description: `${options.description} Based on ${records.length} complete daily ${records[0].metricCode} observations.` }));
}

/**
 * Add complete-month summaries derived only from the normalized daily NOAA rows.
 * Partial months intentionally produce no aggregate so the agent cannot present
 * an incomplete total or average as a complete monthly answer.
 */
export function addMonthlyAggregates(dailyRecords: NormalizedRecord[]): NormalizedRecord[] {
  const daily = dailyRecords.filter((record) => record.recordType === "daily");
  const aggregates: NormalizedRecord[] = [];
  const metricRecords = daily.filter((record) => ["TMAX", "TMIN", "PRCP"].includes(record.metricCode));

  for (const records of groupRecords(metricRecords, (record) => `${record.stationId}|${record.year}|${record.month}|${record.metricCode}`).values()) {
    const first = records[0];
    const month = String(first.month).padStart(2, "0");
    const expected = daysInMonth(first.year, first.month);
    const summary = first.metricCode === "PRCP" ? "total" : "average";
    addAggregateGroup(aggregates, records, expected, {
      objectIDSuffix: `${first.year}-${month}_${first.metricCode}_${first.metricCode === "PRCP" ? "monthly_total" : "monthly_average"}`,
      aggregation: first.metricCode === "PRCP" ? "monthly_total" : "monthly_average", aggregationDimension: "month", aggregationValue: `${first.year}-${month}`,
      date: `${first.year}-${month}`, dateNumeric: Number(`${first.year}${month}`), month: first.month, metric: first.metric, metricCode: first.metricCode, summary,
      dateRange: `${first.year}-${month}-01 to ${first.year}-${month}-${String(expected).padStart(2, "0")}`,
      description: `${first.city} at ${first.station}: ${first.metricCode === "PRCP" ? "monthly precipitation total" : `monthly average ${first.metric}`} for ${monthLabel(first.year, first.month)} ${first.year}.`,
      recordType: "monthly_aggregate",
    });

    if (first.metricCode === "PRCP" && isComplete(records, expected)) {
      const rainyDays = records.filter((record) => record.value > 0).length;
      aggregates.push(makeAggregate(first, {
        objectIDSuffix: `${first.year}-${month}_PRCP_monthly_rainy_days`, aggregation: "monthly_count", aggregationDimension: "month", aggregationValue: `${first.year}-${month}`,
        date: `${first.year}-${month}`, dateNumeric: Number(`${first.year}${month}`), month: first.month, metric: "rainy days", metricCode: "PRCP_DAYS", value: rainyDays, unit: "days", rawValue: rainyDays, rawUnit: "days",
        dateRange: `${first.year}-${month}-01 to ${first.year}-${month}-${String(expected).padStart(2, "0")}`, observationCount: records.length, expectedObservationCount: expected,
        description: `${first.city} at ${first.station}: ${rainyDays} rainy days in ${monthLabel(first.year, first.month)} ${first.year}, counting daily precipitation greater than 0 inches.`,
        threshold: 0, thresholdLabel: "PRCP > 0 in",
      }));
    }
  }

  for (const records of groupRecords(metricRecords, (record) => `${record.stationId}|${record.year}|${record.weekdayNumber}|${record.metricCode}`).values()) {
    const first = records[0];
    const weekdayNumber = first.weekdayNumber!;
    const expected = expectedWeekdayCount(first.year, weekdayNumber);
    addAggregateGroup(aggregates, records, expected, {
      objectIDSuffix: `${first.year}_${first.metricCode}_weekday_${first.weekdayNumber}_average`, aggregation: "weekday_average", aggregationDimension: "weekday", aggregationValue: first.weekday!,
      date: `${first.year}-${first.weekday}`, dateNumeric: first.year * 100 + weekdayNumber, month: 0, metric: first.metric, metricCode: first.metricCode, summary: "average",
      dateRange: `${first.year}-01-01 to ${first.year}-12-31`, description: `${first.city} at ${first.station}: average ${first.metric} on ${first.weekday}s in ${first.year}.`, weekday: first.weekday, weekdayNumber,
    });
  }

  for (const records of groupRecords(metricRecords, (record) => `${record.stationId}|${record.year}|${record.season}|${record.metricCode}`).values()) {
    const first = records[0];
    const expected = expectedSeasonDays(first.year, first.season as Season);
    const summary = first.metricCode === "PRCP" ? "total" : "average";
    addAggregateGroup(aggregates, records, expected, {
      objectIDSuffix: `${first.year}_${first.metricCode}_season_${first.season}`, aggregation: first.metricCode === "PRCP" ? "seasonal_total" : "seasonal_average", aggregationDimension: "season", aggregationValue: first.season!,
      date: `${first.year}-${first.season}`, dateNumeric: first.year * 10, month: 0, metric: first.metric, metricCode: first.metricCode, summary,
      dateRange: `${first.year}-01-01 to ${first.year}-12-31`, description: `${first.city} at ${first.station}: ${first.metricCode === "PRCP" ? "seasonal precipitation total" : `seasonal average ${first.metric}`} for ${first.season} ${first.year}.`, season: first.season,
    });
  }

  for (const records of groupRecords(metricRecords, (record) => `${record.stationId}|${record.year}|${record.metricCode}`).values()) {
    const first = records[0];
    const expected = daysInMonth(first.year, 2) === 29 ? 366 : 365;
    const summary = first.metricCode === "PRCP" ? "total" : "average";
    if (!isComplete(records, expected)) continue;
    addAggregateGroup(aggregates, records, expected, {
      objectIDSuffix: `${first.year}_${first.metricCode}_annual_${first.metricCode === "PRCP" ? "total" : "average"}`, aggregation: first.metricCode === "PRCP" ? "annual_total" : "annual_average", aggregationDimension: "year", aggregationValue: String(first.year),
      date: String(first.year), dateNumeric: first.year, month: 0, metric: first.metric, metricCode: first.metricCode, summary,
      dateRange: `${first.year}-01-01 to ${first.year}-12-31`, description: `${first.city} at ${first.station}: ${first.metricCode === "PRCP" ? "annual precipitation total" : `annual average ${first.metric}`} for ${first.year}.`,
    });

    if (first.metricCode === "PRCP") {
      const rainyDays = records.filter((record) => record.value > 0).length;
      const longestDry = longestRun(records, (record) => record.value <= 0);
      aggregates.push(makeAggregate(first, {
        objectIDSuffix: `${first.year}_PRCP_annual_rainy_days`, aggregation: "annual_count", aggregationDimension: "year", aggregationValue: String(first.year), date: String(first.year), dateNumeric: first.year, month: 0,
        metric: "rainy days", metricCode: "PRCP_DAYS", value: rainyDays, unit: "days", rawValue: rainyDays, rawUnit: "days", dateRange: `${first.year}-01-01 to ${first.year}-12-31`, observationCount: records.length, expectedObservationCount: expected,
        description: `${first.city} at ${first.station}: ${rainyDays} rainy days in ${first.year}, counting daily precipitation greater than 0 inches.`, threshold: 0, thresholdLabel: "PRCP > 0 in",
      }));
      if (longestDry) {
        aggregates.push(makeAggregate(first, {
          objectIDSuffix: `${first.year}_PRCP_annual_longest_dry_streak`, aggregation: "annual_longest_dry_streak", aggregationDimension: "year", aggregationValue: String(first.year), date: longestDry.end, dateNumeric: Number(longestDry.end.replaceAll("-", "")), month: 0,
          metric: "dry spell", metricCode: "PRCP_DRY_STREAK", value: longestDry.length, unit: "days", rawValue: longestDry.length, rawUnit: "days", dateRange: `${longestDry.start} to ${longestDry.end}`, observationCount: records.length, expectedObservationCount: expected,
          description: `${first.city} at ${first.station}: longest dry spell in ${first.year} lasted ${longestDry.length} consecutive days, from ${longestDry.start} through ${longestDry.end}.`, eventStartDate: longestDry.start, eventEndDate: longestDry.end,
        }));
      }
    }
  }

  addThresholdAggregates(aggregates, metricRecords, "TMAX", (record) => record.value > 90, "days above 90°F", "TMAX_GT90", "TMAX > 90 °F");
  addThresholdAggregates(aggregates, metricRecords, "TMIN", (record) => record.value <= 32, "freezing days", "TMIN_LE32", "TMIN <= 32 °F");
  addAnnualExtremes(aggregates, metricRecords, "TMAX", "max", "hottest day", "TMAX_MAX");
  addAnnualExtremes(aggregates, metricRecords, "TMIN", "min", "coldest day", "TMIN_MIN");
  addAnnualExtremes(aggregates, metricRecords, "PRCP", "max", "wettest day", "PRCP_MAX");
  addTemperatureRangeAggregates(aggregates, metricRecords);

  return [...daily, ...aggregates];
}

function longestRun(records: NormalizedRecord[], predicate: (record: NormalizedRecord) => boolean) {
  let current: { start: string; end: string; length: number } | null = null;
  let best: { start: string; end: string; length: number } | null = null;
  for (const record of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    if (predicate(record)) {
      current = current ? { start: current.start, end: record.date, length: current.length + 1 } : { start: record.date, end: record.date, length: 1 };
      if (!best || current.length > best.length) best = current;
    } else current = null;
  }
  return best;
}

function addThresholdAggregates(output: NormalizedRecord[], daily: NormalizedRecord[], metricCode: string, predicate: (record: NormalizedRecord) => boolean, metric: string, derivedMetricCode: string, thresholdLabel: string) {
  for (const records of groupRecords(daily.filter((record) => record.metricCode === metricCode), (record) => `${record.stationId}|${record.year}`).values()) {
    const first = records[0];
    const expected = daysInMonth(first.year, 2) === 29 ? 366 : 365;
    if (!isComplete(records, expected)) continue;
    const count = records.filter(predicate).length;
    output.push(makeAggregate(first, {
      objectIDSuffix: `${first.year}_${derivedMetricCode}`, aggregation: "annual_count", aggregationDimension: "year", aggregationValue: String(first.year), date: String(first.year), dateNumeric: first.year, month: 0,
      metric, metricCode: derivedMetricCode, value: count, unit: "days", rawValue: count, rawUnit: "days", dateRange: `${first.year}-01-01 to ${first.year}-12-31`, observationCount: records.length, expectedObservationCount: expected,
      description: `${first.city} at ${first.station}: ${count} ${metric.toLowerCase()} in ${first.year}, using the threshold ${thresholdLabel}.`, thresholdLabel,
    }));
  }
}

function addAnnualExtremes(output: NormalizedRecord[], daily: NormalizedRecord[], metricCode: string, direction: "max" | "min", metric: string, derivedMetricCode: string) {
  for (const records of groupRecords(daily.filter((record) => record.metricCode === metricCode), (record) => `${record.stationId}|${record.year}`).values()) {
    const first = records[0];
    const expected = daysInMonth(first.year, 2) === 29 ? 366 : 365;
    if (!isComplete(records, expected)) continue;
    const extreme = [...records].sort((a, b) => direction === "max" ? b.value - a.value : a.value - b.value)[0];
    output.push(makeAggregate(first, {
      objectIDSuffix: `${first.year}_${derivedMetricCode}`, aggregation: direction === "max" ? "annual_extreme_max" : "annual_extreme_min", aggregationDimension: "year", aggregationValue: String(first.year), date: extreme.date, dateNumeric: extreme.dateNumeric, month: extreme.month,
      metric, metricCode: derivedMetricCode, value: extreme.value, unit: extreme.unit, rawValue: extreme.rawValue, rawUnit: extreme.rawUnit, dateRange: extreme.date, observationCount: records.length, expectedObservationCount: expected,
      description: `${first.city} at ${first.station}: ${metric} in ${first.year} was ${extreme.value.toFixed(extreme.unit === "°F" ? 2 : 3)} ${extreme.unit} on ${extreme.date}.`, extremeDate: extreme.date,
    }));
  }
}

function addTemperatureRangeAggregates(output: NormalizedRecord[], daily: NormalizedRecord[]) {
  const paired = new Map<string, { max?: NormalizedRecord; min?: NormalizedRecord }>();
  for (const record of daily) {
    if (record.metricCode !== "TMAX" && record.metricCode !== "TMIN") continue;
    const key = `${record.stationId}|${record.date}`;
    const pair = paired.get(key) || {};
    if (record.metricCode === "TMAX") pair.max = record; else pair.min = record;
    paired.set(key, pair);
  }
  const ranges = [...paired.values()].flatMap((pair) => pair.max && pair.min ? [{ ...pair.max, value: Number((pair.max.value - pair.min.value).toFixed(2)), rawValue: Number((pair.max.value - pair.min.value).toFixed(2)), rawUnit: "°F", metric: "daily temperature range", metricCode: "DTR", unit: "°F" }] : []);
  for (const records of groupRecords(ranges, (record) => `${record.stationId}|${record.year}`).values()) {
    const first = records[0];
    const expected = daysInMonth(first.year, 2) === 29 ? 366 : 365;
    if (!isComplete(records, expected)) continue;
    addAggregateGroup(output, records, expected, {
      objectIDSuffix: `${first.year}_DTR_annual_average`, aggregation: "annual_average", aggregationDimension: "year", aggregationValue: String(first.year), date: String(first.year), dateNumeric: first.year, month: 0,
      metric: "daily temperature range", metricCode: "DTR", summary: "average", dateRange: `${first.year}-01-01 to ${first.year}-12-31`, description: `${first.city} at ${first.station}: average daily temperature range in ${first.year}.`,
    });
    const widest = [...records].sort((a, b) => b.value - a.value)[0];
    output.push(makeAggregate(first, {
      objectIDSuffix: `${first.year}_DTR_annual_max`, aggregation: "annual_extreme_max", aggregationDimension: "year", aggregationValue: String(first.year), date: widest.date, dateNumeric: widest.dateNumeric, month: widest.month,
      metric: "largest daily temperature range", metricCode: "DTR_MAX", value: widest.value, unit: "°F", rawValue: widest.value, rawUnit: "°F", dateRange: widest.date, observationCount: records.length, expectedObservationCount: expected,
      description: `${first.city} at ${first.station}: largest daily temperature range in ${first.year} was ${widest.value.toFixed(2)} °F on ${widest.date}.`, extremeDate: widest.date,
    }));
  }
}
