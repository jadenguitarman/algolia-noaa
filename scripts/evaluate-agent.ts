import { randomUUID } from "node:crypto";

const appId = process.env.ALGOLIA_APP_ID || process.env.VITE_ALGOLIA_APP_ID;
const apiKey = process.env.VITE_ALGOLIA_SEARCH_API_KEY;
const agentId = process.env.VITE_ALGOLIA_AGENT_ID;
if (!appId || !apiKey || !agentId) throw new Error("ALGOLIA_APP_ID (or VITE_ALGOLIA_APP_ID), VITE_ALGOLIA_SEARCH_API_KEY, and VITE_ALGOLIA_AGENT_ID are required.");
const endpoint = `https://${appId}.algolia.net/agent-studio/1/agents/${agentId}/completions?stream=false&compatibilityMode=ai-sdk-5`;
const questions = [
  { prompt: "What was the average maximum temperature in New York in July 2024?", mustMention: ["New York", "July", "2024"] },
  { prompt: "Which city had the most precipitation in March 2024?", mustMention: ["March", "2024", "precipitation"] },
  { prompt: "Compare minimum temperatures in Chicago and San Francisco during January 2024.", mustMention: ["Chicago", "San Francisco", "January", "2024"] },
  { prompt: "What was the weather in Boston in 2024?", mustMention: ["cannot", "available"] },
];
for (const test of questions) {
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-algolia-application-id": appId, "x-algolia-api-key": apiKey }, body: JSON.stringify({ id: `alg_cnv_${randomUUID()}`, messages: [{ id: `alg_msg_${randomUUID()}`, role: "user", content: test.prompt }] }) });
  const body = await response.text(); if (!response.ok) throw new Error(`Agent request failed (${response.status}): ${body.slice(0, 500)}`);
  const lower = body.toLowerCase(); const misses = test.mustMention.filter((term) => !lower.includes(term.toLowerCase()));
  console.log(`${misses.length ? "FAIL" : "PASS"} ${test.prompt}${misses.length ? ` — missing: ${misses.join(", ")}` : ""}`);
}
