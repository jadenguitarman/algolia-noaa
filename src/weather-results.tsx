import React from "react";
import { createPortal } from "react-dom";

type WeatherRecord = {
  objectID?: string;
  station?: string;
  stationId?: string;
  city?: string;
  date?: string;
  metric?: string;
  metricCode?: string;
  value?: number;
  unit?: string;
  rawValue?: number;
  rawUnit?: string;
  normalizedFahrenheit?: number;
  normalizedInches?: number;
  latitude?: number;
  longitude?: number;
  source?: string;
  sourceDataset?: string;
  descriptiveText?: string;
  [key: string]: unknown;
};

type WeatherToolLayoutProps = {
  context: {
    message?: { output?: unknown };
  };
};

type SearchToolOutput = {
  hits?: unknown;
  nbHits?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isWeatherRecord(value: unknown): value is WeatherRecord {
  return isRecord(value);
}

function getOutput(value: unknown): SearchToolOutput | null {
  if (!isRecord(value)) return null;
  return value as SearchToolOutput;
}

function formatNumber(value: number | undefined, maximumFractionDigits = 3) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits }).format(value);
}

function formatValue(record: WeatherRecord) {
  if (typeof record.value !== "number") return "—";
  return `${formatNumber(record.value)}${record.unit ? ` ${record.unit}` : ""}`;
}

function WeatherRecordCard({ record, index }: { record: WeatherRecord; index: number }) {
  const location = [record.city, record.station].filter(Boolean).join(" · ");
  const coordinates = [record.latitude, record.longitude]
    .filter((value): value is number => typeof value === "number")
    .map((value) => formatNumber(value, 5))
    .join(", ");

  return (
    <li className="weather-record-card">
      <div className="weather-record-card__heading">
        <div>
          <span className="weather-record-card__index">Observation {index + 1}</span>
          <h3>{location || "NOAA observation"}</h3>
        </div>
        <time dateTime={record.date}>{record.date || "Unknown date"}</time>
      </div>
      <div className="weather-record-card__measure">
        <span>{record.metric || record.metricCode || "Observation"}</span>
        <strong>{formatValue(record)}</strong>
      </div>
      <dl className="weather-record-card__details">
        <div><dt>Station ID</dt><dd>{record.stationId || "—"}</dd></div>
        <div><dt>NOAA raw value</dt><dd>{typeof record.rawValue === "number" ? `${formatNumber(record.rawValue)} ${record.rawUnit || ""}` : "—"}</dd></div>
        <div><dt>Coordinates</dt><dd>{coordinates || "—"}</dd></div>
        <div><dt>Dataset</dt><dd>{record.sourceDataset || "GHCND"}</dd></div>
      </dl>
      {record.descriptiveText && <p className="weather-record-card__description">{record.descriptiveText}</p>}
      <details className="weather-record-card__json" open>
        <summary>Record JSON</summary>
        <pre>{JSON.stringify(record, null, 2)}</pre>
      </details>
    </li>
  );
}

function WeatherResultsDialog({ hits, onClose }: { hits: WeatherRecord[]; onClose: () => void }) {
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="weather-results-modal"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section className="weather-results-dialog" role="dialog" aria-modal="true" aria-labelledby="weather-results-title">
        <header className="weather-results-dialog__header">
          <div>
            <span className="weather-results-dialog__eyebrow">NOAA observations</span>
            <h2 id="weather-results-title">Retrieved weather data</h2>
            <p>{hits.length} record{hits.length === 1 ? "" : "s"} returned by the indexed GHCND dataset.</p>
          </div>
          <button type="button" className="weather-results-dialog__close" onClick={onClose} aria-label="Close weather data">
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="weather-results-dialog__body">
          {hits.length > 0 ? (
            <ol className="weather-record-list">
              {hits.map((record, index) => <WeatherRecordCard key={record.objectID || `${record.date}-${record.metric}-${index}`} record={record} index={index} />)}
            </ol>
          ) : (
            <p className="weather-results-dialog__empty">The search completed, but the index returned no matching observations.</p>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}

export function WeatherResultsLayout({ context }: WeatherToolLayoutProps) {
  const output = getOutput(context.message?.output);
  const hits = Array.isArray(output?.hits) ? output.hits.filter(isWeatherRecord) : [];
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    if (hits.length === 0) setIsOpen(false);
  }, [hits.length]);

  const isComplete = Boolean(output);
  const resultCount = typeof output?.nbHits === "number" ? output.nbHits : hits.length;

  return (
    <>
      <div className={`weather-results-summary${isComplete ? " weather-results-summary--complete" : ""}`} aria-live="polite">
        <span className="weather-results-summary__dot" aria-hidden="true" />
        <span>{isComplete ? "Retrieved weather data." : "Retrieving weather data…"}</span>
        {isComplete && hits.length > 0 && (
          <button type="button" className="weather-results-summary__button" onClick={() => setIsOpen(true)}>
            See results<span aria-hidden="true"> ↗</span>
            <span className="sr-only"> ({resultCount} records)</span>
          </button>
        )}
      </div>
      {isOpen && <WeatherResultsDialog hits={hits} onClose={() => setIsOpen(false)} />}
    </>
  );
}
