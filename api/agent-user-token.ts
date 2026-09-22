import { createHmac } from "node:crypto";

type VercelRequest = { method?: string };
type VercelResponse = {
  setHeader(name: string, value: string): VercelResponse;
  status(code: number): VercelResponse;
  json(body: unknown): void;
};

function base64Url(value: string) {
  return Buffer.from(value).toString("base64url");
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.ALGOLIA_AGENT_USER_AUTH_KEY;
  const secretKeyId = process.env.ALGOLIA_AGENT_USER_AUTH_KEY_ID;
  const userId = process.env.ALGOLIA_AGENT_USER_ID || "noaa-demo-user";

  if (!secretKey || !secretKeyId) {
    return res.status(500).json({ error: "Agent user authentication is not configured" });
  }

  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT", kid: secretKeyId }));
  const payload = base64Url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60 }));
  const unsignedToken = `${header}.${payload}`;
  const signature = createHmac("sha256", secretKey).update(unsignedToken).digest("base64url");

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ userToken: `${unsignedToken}.${signature}` });
}
