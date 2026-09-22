import React from "react";
import { createRoot } from "react-dom/client";
import { Chat, InstantSearch, SearchBox, useSearchBox } from "react-instantsearch";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import "instantsearch.css/themes/satellite.css";
import "instantsearch.css/components/chat.css";
import "./styles.css";
import { coverage } from "./data";

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const searchKey = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;
const indexName = import.meta.env.VITE_ALGOLIA_INDEX_NAME || "noaa_weather_demo";
const agentId = import.meta.env.VITE_ALGOLIA_AGENT_ID;
const isConfigured = Boolean(appId && searchKey && agentId);
const searchClient = isConfigured ? algoliasearch(appId, searchKey) : null;

const questions = [
  { label: "Temperature", text: "What was the average maximum temperature in New York in July 2024?" },
  { label: "Precipitation", text: "Which city had the most precipitation in March 2024?" },
  { label: "Comparison", text: "Compare minimum temperatures in Chicago and San Francisco during January 2024." },
];

function ConfigurationNotice() {
  return (
    <div className="notice" role="status">
      <strong>Demo configuration needed.</strong> Add the four VITE_ALGOLIA_* values from the published
      Agent Studio setup to enable the live chat. The UI is intentionally read-only until then.
    </div>
  );
}

function CoveragePanel() {
  return (
    <aside className="coverage-card" aria-label="Data coverage">
      <h2>Data coverage</h2>
      <p className="coverage-card__intro">A small, focused slice of the NOAA daily record for this demo.</p>
      <dl className="coverage-list">
        <div><dt>Places</dt><dd>{coverage.cities.join(" / ")}</dd></div>
        <div><dt>Dates</dt><dd>{coverage.dates.replace(" → ", " to ")}</dd></div>
        <div><dt>Measures</dt><dd>{coverage.metrics.join(" / ")}</dd></div>
      </dl>
    </aside>
  );
}

function DemoChat() {
  if (!searchClient || !agentId) return <ConfigurationNotice />;
  return <AuthenticatedChat />;
}

function ChatEmptyState() {
  return (
    <div className="chat-empty-state">
      <p>Ask a question about the indexed NOAA record.</p>
      <span>Use a city, a date range, and a metric to get started.</span>
    </div>
  );
}

function AuthenticatedChat() {
  const [userToken, setUserToken] = React.useState<string | null>(null);
  const [authError, setAuthError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/agent-user-token", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as { userToken?: string; error?: string };
        if (!response.ok || !body.userToken) throw new Error(body.error || "Could not connect to the agent");
        if (!cancelled) setUserToken(body.userToken);
      })
      .catch((error: unknown) => {
        if (!cancelled) setAuthError(error instanceof Error ? error.message : "Could not connect to the agent");
      });
    return () => { cancelled = true; };
  }, []);

  if (authError) {
    return <div className="notice" role="alert"><strong>Chat connection unavailable.</strong> {authError}</div>;
  }
  if (!userToken) {
    return <div className="notice" role="status">Connecting to NOAA Weather Expert…</div>;
  }

  return (
    <InstantSearch searchClient={searchClient!} indexName={indexName}>
      <div className="chat-shell">
        <ExampleQueryBridge />
        <div className="chat-shell__bar">
          <div>
            <span className="chat-shell__label">Ask a question</span>
            <p>Ask about a place, date range, and metric.</p>
          </div>
          <span className="chat-shell__status">Indexed NOAA data</span>
        </div>
        <SearchBox placeholder="Search or ask a historical question…" aiMode />
        <Chat
          agentId={agentId!}
          requestOptions={{ headers: { "x-algolia-secure-user-token": userToken } }}
          context={{ scope: "Historical GHCND observations only", indexName, coverage: JSON.stringify(coverage) }}
          messagesProps={{ emptyComponent: ChatEmptyState }}
          translations={{
            prompt: { disclaimer: "Answers use indexed NOAA observations only; they are not forecasts." },
          }}
        />
      </div>
    </InstantSearch>
  );
}

function ExampleQueryBridge() {
  const { refine } = useSearchBox();
  React.useEffect(() => {
    const handler = (event: Event) => refine((event as CustomEvent<string>).detail);
    window.addEventListener("noaa-example", handler);
    return () => window.removeEventListener("noaa-example", handler);
  }, [refine]);
  return null;
}

function App() {
  return (
    <main className="page-shell">
      <div className="demo-layout">
        <section className="explanation" aria-labelledby="page-heading">
          <div className="explanation__copy">
            <h1 id="page-heading">Historical weather observations, explained.</h1>
            <p className="lede">This demo uses Algolia Agent Studio to answer questions about daily NOAA records from three US cities.</p>
          </div>
          <CoveragePanel />
        </section>
        <section className="demo-panel" aria-labelledby="ask-heading">
          <div className="section-heading">
            <h2 id="ask-heading">Ask the demo.</h2>
            <p>Try one of these questions or write your own.</p>
          </div>
          <div className="question-grid" aria-label="Example questions">
            {questions.map((question) => <button key={question.text} type="button" onClick={() => window.dispatchEvent(new CustomEvent("noaa-example", { detail: question.text }))}>
              <span className="question-text">{question.text}</span>
              <span className="question-arrow" aria-hidden="true">↗</span>
            </button>)}
          </div>
          <DemoChat />
        </section>
      </div>
      <footer>Source: NOAA Climate Data Online, GHCND daily summaries. US units normalized where applicable.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
