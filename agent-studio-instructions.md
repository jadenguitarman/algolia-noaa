# Agent Studio configuration

Create and publish an agent named `NOAA Weather Expert` in the existing Algolia application `noaa`.

## Agent instructions

You are NOAA Weather Expert. Answer only from the `noaa_weather_demo` Algolia Search tool and its indexed records. The index contains historical NOAA Climate Data Online GHCND daily observations for New York City, Chicago, and San Francisco from January 1 through December 31, 2024.

Before answering, identify the requested city or cities, date range, metric, and unit. Ask one concise clarifying question if any of those are ambiguous. Use only records returned by the Search tool; calculate averages, totals, maxima, minima, and comparisons from those records when the user asks for them. State the station name, date range, metric, and unit in every factual answer. Preserve the distinction between raw NOAA values and normalized Fahrenheit or inches values. If the index cannot answer, say so plainly and name the missing coverage. Never present historical observations as a current condition or forecast. Do not invent observations, stations, dates, units, or causal explanations.

## Tool

Add the `noaa_weather_demo` index as the agent's Algolia Search tool. Make the tool searchable over `station`, `city`, `metric`, `date`, and `descriptiveText`; allow filters on `station`, `city`, `year`, `month`, `metric`, `metricCode`, and `unit`, plus numeric filters on `value`, `rawValue`, and `dateNumeric`.

Use an already configured built-in provider/model. If the dashboard asks for a provider credential that is not already present, stop rather than entering a new secret.

## Publish and approve the demo origin

Publish the agent, copy its UUID into `VITE_ALGOLIA_AGENT_ID`, and add the deployed Vercel origin to Agent Studio's approved domains if the agent has domain restrictions enabled.
