import { createHmac, randomUUID } from "node:crypto";

const appId = process.env.ALGOLIA_APP_ID || process.env.VITE_ALGOLIA_APP_ID;
const apiKey = process.env.VITE_ALGOLIA_SEARCH_API_KEY;
const agentId = process.env.VITE_ALGOLIA_AGENT_ID;
const agentUserAuthKey = process.env.ALGOLIA_AGENT_USER_AUTH_KEY;
const agentUserAuthKeyId = process.env.ALGOLIA_AGENT_USER_AUTH_KEY_ID;
const agentUserId = process.env.ALGOLIA_AGENT_USER_ID || "noaa-demo-user";
const adminKey = process.env.ALGOLIA_ADMIN_API_KEY;
if (!appId || !apiKey || !agentId) throw new Error("ALGOLIA_APP_ID (or VITE_ALGOLIA_APP_ID), VITE_ALGOLIA_SEARCH_API_KEY, and VITE_ALGOLIA_AGENT_ID are required.");
const requiredAppId = appId;
const endpoint = `https://${requiredAppId}.algolia.net/agent-studio/1/agents/${agentId}/completions?stream=false&compatibilityMode=ai-sdk-5`;

function base64Url(value: string | Uint8Array) { return Buffer.from(value).toString("base64url"); }

async function resolveAgentUserAuthKeyId() {
  if (!agentUserAuthKey) return undefined;
  if (agentUserAuthKeyId) return agentUserAuthKeyId;
  if (!adminKey) throw new Error("ALGOLIA_ADMIN_API_KEY is required to resolve ALGOLIA_AGENT_USER_AUTH_KEY_ID locally.");
  const response = await fetch(`https://${requiredAppId}.algolia.net/agent-studio/1/secret-keys`, { headers: { "x-algolia-application-id": requiredAppId, "x-algolia-api-key": adminKey } });
  if (!response.ok) throw new Error(`Could not list Agent Studio secret-key metadata (${response.status}).`);
  const body = await response.json() as { data?: Array<{ id: string; value?: string }> };
  const matchingKey = body.data?.find((key) => key.value === agentUserAuthKey);
  if (!matchingKey) throw new Error("ALGOLIA_AGENT_USER_AUTH_KEY was not found in this Algolia application's Agent Studio secret keys.");
  return matchingKey.id;
}

async function createSecureUserToken() {
  if (!agentUserAuthKey) return undefined;
  const keyId = await resolveAgentUserAuthKeyId();
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: keyId }));
  const payload = base64Url(JSON.stringify({ sub: agentUserId, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }));
  const signature = createHmac("sha256", agentUserAuthKey).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${signature}`;
}

const secureUserToken = await createSecureUserToken();
type Evaluation = { prompt: string; mustMention: string[]; mustMentionOne?: string[]; mustMentionAlsoOne?: string[] };
const questions: Evaluation[] = [
  { prompt: "What was the average maximum temperature in New York in July 2024?", mustMention: ["New York", "July", "2024"], mustMentionOne: ["°F", "fahrenheit"] },
  { prompt: "Which city had the longest dry spell in 2024?", mustMention: ["Los Angeles", "2024"], mustMentionOne: ["180", "180 days"] },
  { prompt: "Which city had the biggest temperature swing in 2024?", mustMention: ["Denver", "2024"], mustMentionOne: ["48.96", "49.0", "49"], mustMentionAlsoOne: ["December", "2024-12-21", "12/21"] },
  { prompt: "Which city had the most freezing days in 2024?", mustMention: ["Denver", "2024"], mustMentionOne: ["152", "152 days"] },
  { prompt: "What's the average maximum temperature on Wednesdays in Boston in 2024?", mustMention: ["Boston", "Wednesday", "2024"], mustMentionOne: ["62.35", "62.4"], mustMentionAlsoOne: ["°F", "fahrenheit"] },
  { prompt: "Which city had the most precipitation in March 2024?", mustMention: ["New York", "March", "2024", "precipitation"], mustMentionOne: ["9.067", "9.07", "9.1"], mustMentionAlsoOne: ["total", "monthly"] },
  { prompt: "Which city had the most precipitation in March 2024? Compare the monthly totals, not a single day.", mustMention: ["New York", "March", "2024", "precipitation"], mustMentionOne: ["9.067", "9.07", "9.1"], mustMentionAlsoOne: ["total", "monthly"] },
  { prompt: "Compare minimum temperatures in Chicago and San Francisco during January 2024.", mustMention: ["Chicago", "San Francisco", "January", "2024", "°F"] },
  { prompt: "What was the weather in Miami in 2024?", mustMention: ["Miami"], mustMentionOne: ["can't", "can’t", "cannot", "don't have", "don’t have", "no data", "no matching weather data", "not available", "not covered", "not in the indexed", "not in the dataset", "does not contain", "not found", "not included", "outside"] },
];
for (const test of questions) {
  const messageId = `alg_msg_${randomUUID()}`;
  const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json", "x-algolia-application-id": requiredAppId, "x-algolia-api-key": apiKey, ...(secureUserToken ? { "x-algolia-secure-user-token": secureUserToken } : {}) }, body: JSON.stringify({ id: `alg_cnv_${randomUUID()}`, messageId, messages: [{ id: messageId, role: "user", parts: [{ type: "text", text: test.prompt }] }] }) });
  const body = await response.text(); if (!response.ok) throw new Error(`Agent request failed (${response.status}): ${body.slice(0, 500)}`);
  const lower = body.toLowerCase(); const misses = test.mustMention.filter((term) => !lower.includes(term.toLowerCase())); const hasOne = !test.mustMentionOne || test.mustMentionOne.some((term) => lower.includes(term.toLowerCase())); if (!hasOne) misses.push(`one of: ${test.mustMentionOne?.join(", ")}`); const hasAlsoOne = !test.mustMentionAlsoOne || test.mustMentionAlsoOne.some((term) => lower.includes(term.toLowerCase())); if (!hasAlsoOne) misses.push(`one of: ${test.mustMentionAlsoOne?.join(", ")}`);
  console.log(`${misses.length ? "FAIL" : "PASS"} ${test.prompt}${misses.length ? ` — missing: ${misses.join(", ")}` : ""}`);
}
