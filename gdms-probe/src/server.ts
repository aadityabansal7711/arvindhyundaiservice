import * as http from "node:http";
import { runProbe } from "./probe";
import { runProxyComparison } from "./proxy-probe";

const PORT = Number(process.env.PORT) || 8080;
const PROBE_TOKEN = process.env.PROBE_TOKEN;

if (!PROBE_TOKEN) {
  throw new Error("Missing PROBE_TOKEN env var — required to authenticate callers.");
}

const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const auth = req.headers.authorization ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
  if (token !== PROBE_TOKEN) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  try {
    if (req.url === "/proxy-test") {
      const report = await runProxyComparison();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(report, null, 2));
      return;
    }

    const report = await runProbe();
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(report, null, 2));
  } catch (err) {
    // Never let a raw error object reach the response/logs unfiltered — it
    // could be a proxy library error with credentials embedded in a URL.
    console.error("[gdms-probe] probe crashed:", err instanceof Error ? err.message : String(err));
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
  }
});

server.listen(PORT, () => {
  console.log(`gdms-probe listening on :${PORT}`);
});
