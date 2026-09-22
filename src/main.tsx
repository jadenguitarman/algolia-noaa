import React from "react";
import { createRoot } from "react-dom/client";
import { Chat, InstantSearch, SearchBox, useSearchBox } from "react-instantsearch";
import { liteClient as algoliasearch } from "algoliasearch/lite";
import "instantsearch.css/themes/satellite.css";
import "./styles.css";
import { coverage } from "./data";

const appId = import.meta.env.VITE_ALGOLIA_APP_ID;
const searchKey = import.meta.env.VITE_ALGOLIA_SEARCH_API_KEY;
const indexName = import.meta.env.VITE_ALGOLIA_INDEX_NAME || "noaa_weather_demo";
const agentId = import.meta.env.VITE_ALGOLIA_AGENT_ID;
const isConfigured = Boolean(appId && searchKey && agentId);
const searchClient = isConfigured ? algoliasearch(appId, searchKey) : null;

const questions = [
  "What was the average maximum temperature in New York in July 2024?",
  "Which city had the most precipitation in March 2024?",
  "Compare minimum temperatures in Chicago and San Francisco during January 2024.",
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
    <aside className="coverage" aria-label="Data coverage">
      <p className="eyebrow">INDEXED DATA</p>
      <h2>Coverage</h2>
      <dl>
        <div><dt>Places</dt><dd>{coverage.cities.join(" · ")}</dd></div>
        <div><dt>Dates</dt><dd>{coverage.dates}</dd></div>
        <div><dt>Metrics</dt><dd>{coverage.metrics.join(" · ")}</dd></div>
      </dl>
      <p className="source">{coverage.source}</p>
    </aside>
  );
}

function DemoChat() {
  if (!searchClient || !agentId) return <ConfigurationNotice />;
  return <AuthenticatedChat />;
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
        <SearchBox placeholder="Search or ask a historical question…" aiMode />
        <Chat
          agentId={agentId!}
          requestOptions={{ headers: { "x-algolia-secure-user-token": userToken } }}
          context={{ scope: "Historical GHCND observations only", indexName, coverage: JSON.stringify(coverage) }}
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
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">NOAA · GHCND · 2024</p>
          <h1>NOAA Weather Expert</h1>
          <p className="lede">Ask grounded questions about historical daily observations for three US cities. The expert searches a curated NOAA index and says when the data cannot answer.</p>
          <p className="boundary">Historical observations only · Not a live forecast</p>
        </div>
        <CoveragePanel />
      </header>
      <section className="workspace" aria-labelledby="ask-heading">
        <div className="section-heading">
          <p className="eyebrow">ASK THE INDEX</p>
          <h2 id="ask-heading">What do you want to compare?</h2>
          <p>Try a specific place, date range, and metric. Include units when you have a preference.</p>
        </div>
        <div className="question-grid" aria-label="Example questions">
          {questions.map((question) => <button key={question} type="button" onClick={() => window.dispatchEvent(new CustomEvent("noaa-example", { detail: question }))}>{question}</button>)}
        </div>
        <DemoChat />
      </section>
      <footer>Source: NOAA Climate Data Online, GHCND daily summaries. Values retain the source observation and normalized US units.</footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<React.StrictMode><App /></React.StrictMode>);
