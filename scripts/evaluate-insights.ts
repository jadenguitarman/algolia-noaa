import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { addMonthlyAggregates, normalize, readJson, type NormalizedRecord, type RawDownload } from "./lib.js";

const records = existsSync(resolve("data/noaa-normalized.json"))
  ? await readJson<NormalizedRecord[]>(resolve("data/noaa-normalized.json"))
  : addMonthlyAggregates(normalize(await readJson<RawDownload>(resolve("data/noaa-fixture.json"))));

const failures: string[] = [];
function expect(name: string, condition: boolean) { if (!condition) failures.push(name); else console.log(`PASS ${name}`); }
function find(predicate: (record: NormalizedRecord) => boolean) { return records.find(predicate); }

const marchTotals = records.filter((record) => record.aggregation === "monthly_total" && record.metricCode === "PRCP" && record.date === "2024-03" && record.coverageComplete);
const newYorkMarch = find((record) => record.city === "New York City" && record.aggregation === "monthly_total" && record.metricCode === "PRCP" && record.date === "2024-03");
const chicagoMarch = find((record) => record.city === "Chicago" && record.aggregation === "monthly_total" && record.metricCode === "PRCP" && record.date === "2024-03");
const bostonWednesday = find((record) => record.city === "Boston" && record.aggregation === "weekday_average" && record.metricCode === "TMAX" && record.weekday === "Wednesday" && record.year === 2024);
const bostonDrySpell = find((record) => record.city === "Boston" && record.aggregation === "annual_longest_dry_streak" && record.year === 2024);
const temperatureSwingRecords = records.filter((record) => record.metricCode === "DTR_MAX" && record.aggregation === "annual_extreme_max" && record.year === 2024 && record.coverageComplete);
const denverTemperatureSwing = find((record) => record.city === "Denver" && record.metricCode === "DTR_MAX" && record.aggregation === "annual_extreme_max" && record.year === 2024);

expect("derived records exist", records.length > records.filter((record) => record.recordType === "daily").length);
expect("March precipitation comparison has seven complete city totals", marchTotals.length === 7);
expect("New York City is above Chicago for March precipitation", Boolean(newYorkMarch && chicagoMarch && newYorkMarch.value > chicagoMarch.value));
expect("Boston Wednesday TMAX aggregate is complete", Boolean(bostonWednesday?.coverageComplete && bostonWednesday.observationCount === 52));
expect("Boston Wednesday TMAX aggregate is 62.35°F", bostonWednesday?.value === 62.35 && bostonWednesday.unit === "°F");
expect("Boston annual dry-spell aggregate is complete", Boolean(bostonDrySpell?.coverageComplete && bostonDrySpell.unit === "days"));
expect("temperature-swing aggregates cover five complete cities", temperatureSwingRecords.length === 5);
expect("Denver has the largest indexed temperature swing", denverTemperatureSwing?.value === 48.96 && denverTemperatureSwing.extremeDate === "2024-12-21");
expect("all aggregates expose provenance and coverage", records.filter((record) => record.recordType !== "daily").every((record) => Boolean(record.derivedFrom && record.observationCount && record.coverageRatio !== undefined)));

if (failures.length) throw new Error(`Insight evaluation failed: ${failures.join("; ")}`);
