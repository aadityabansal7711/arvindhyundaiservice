import * as net from "node:net";
import * as tls from "node:tls";
import { chromium } from "playwright";
import { runProbe, type ProbeReport } from "./probe";

/**
 * Compares "direct from this container" vs "through the Bright Data India
 * ISP proxy" reachability to GDMS. Never touches gdms-service, never enters
 * GDMS credentials, never submits the login form — Test C only checks that
 * the login page and its form fields load.
 *
 * Credentials come exclusively from TEST_PROXY_SERVER/USERNAME/PASSWORD env
 * vars — never hardcoded, never logged. The password is never included in
 * any returned field; the username is masked if present.
 */

const GDMS_HOST = "ndms.hmil.net";
const GDMS_LOGIN_PATH = "/cmm/cmmi/selectLoginMain.dms";
const GEO_CHECK_HOST = "geo.brdtest.com";
const GEO_CHECK_PATH = "/mygeo.json";
const TIMEOUT_MS = 20_000;

export type ProxyConfig = { server: string; username: string; password: string };

export function readProxyConfigFromEnv(): ProxyConfig | null {
  const server = process.env.TEST_PROXY_SERVER;
  const username = process.env.TEST_PROXY_USERNAME;
  const password = process.env.TEST_PROXY_PASSWORD;
  if (!server || !username || !password) return null;
  return { server, username, password };
}

function maskUsername(username: string): string {
  if (username.length <= 8) return "***";
  return `${username.slice(0, 4)}…${username.slice(-2)}`;
}

function parseProxyServer(server: string): { host: string; port: number } {
  // TEST_PROXY_SERVER is given as e.g. "http://brd.superproxy.io:44445" —
  // the scheme is just for clarity, the actual connection is a plain TCP
  // socket that we speak HTTP CONNECT over ourselves.
  const url = new URL(server);
  return { host: url.hostname, port: Number(url.port) || 80 };
}

/** Opens a TCP connection to the proxy and issues an HTTP CONNECT to tunnel to targetHost:targetPort. */
function connectThroughProxy(
  proxy: ProxyConfig,
  targetHost: string,
  targetPort: number
): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const { host, port } = parseProxyServer(proxy.server);
    const socket = net.connect({ host, port });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(new Error(`Proxy TCP/CONNECT timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const finish = (err?: Error, result?: net.Socket) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (err) {
        socket.destroy();
        reject(err);
      } else if (result) {
        resolve(result);
      }
    };

    socket.once("error", (err) => finish(err));

    socket.once("connect", () => {
      const auth = Buffer.from(`${proxy.username}:${proxy.password}`).toString("base64");
      socket.write(
        `CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\n` +
          `Host: ${targetHost}:${targetPort}\r\n` +
          `Proxy-Authorization: Basic ${auth}\r\n` +
          `Connection: keep-alive\r\n\r\n`
      );
    });

    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("latin1");
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      socket.removeListener("data", onData);
      const statusLine = buffer.slice(0, buffer.indexOf("\r\n"));
      const match = /^HTTP\/\d\.\d (\d{3})/.exec(statusLine);
      const status = match ? Number(match[1]) : 0;
      if (status !== 200) {
        finish(new Error(`Proxy CONNECT rejected: "${statusLine || "no status line"}"`));
        return;
      }
      finish(undefined, socket);
    };
    socket.on("data", onData);
  });
}

function tlsUpgrade(socket: net.Socket, servername: string): Promise<tls.TLSSocket> {
  return new Promise((resolve, reject) => {
    const tlsSocket = tls.connect({ socket, servername, rejectUnauthorized: false, timeout: TIMEOUT_MS });
    const timer = setTimeout(() => {
      tlsSocket.destroy();
      reject(new Error(`TLS handshake through proxy timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);
    tlsSocket.once("secureConnect", () => {
      clearTimeout(timer);
      resolve(tlsSocket);
    });
    tlsSocket.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

/** Best-effort HTTP/1.1 chunked-transfer decoder — good enough for a diagnostic body preview. */
function dechunk(raw: string): string {
  let out = "";
  let rest = raw;
  for (;;) {
    const lineEnd = rest.indexOf("\r\n");
    if (lineEnd === -1) break;
    const sizeHex = rest.slice(0, lineEnd).split(";")[0].trim();
    const size = parseInt(sizeHex, 16);
    if (!Number.isFinite(size) || size === 0) break;
    out += rest.slice(lineEnd + 2, lineEnd + 2 + size);
    rest = rest.slice(lineEnd + 2 + size + 2); // skip chunk data + trailing \r\n
  }
  return out || raw;
}

type RawHttpResult = { status: number; bodyBytes: number; bodyPreview: string };

function rawHttpGet(tlsSocket: tls.TLSSocket, host: string, path: string): Promise<RawHttpResult> {
  return new Promise((resolve, reject) => {
    let raw = Buffer.alloc(0);
    let finished = false;

    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      tlsSocket.destroy();
      reject(new Error(`HTTP request through proxy timed out after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      const text = raw.toString("latin1");
      const headerEnd = text.indexOf("\r\n\r\n");
      const statusLine = text.slice(0, text.indexOf("\r\n"));
      const match = /^HTTP\/\d\.\d (\d{3})/.exec(statusLine);
      const status = match ? Number(match[1]) : 0;
      let body = headerEnd === -1 ? "" : text.slice(headerEnd + 4);
      if (/transfer-encoding:\s*chunked/i.test(text.slice(0, headerEnd))) {
        body = dechunk(body);
      }
      resolve({ status, bodyBytes: Buffer.byteLength(body, "latin1"), bodyPreview: body.slice(0, 500) });
    };

    tlsSocket.on("data", (chunk: Buffer) => {
      raw = Buffer.concat([raw, chunk]);
    });
    tlsSocket.once("end", finish);
    tlsSocket.once("close", finish);
    tlsSocket.once("error", (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reject(err);
    });

    tlsSocket.write(
      `GET ${path} HTTP/1.1\r\n` +
        `Host: ${host}\r\n` +
        `User-Agent: Mozilla/5.0\r\n` +
        `Accept-Encoding: identity\r\n` +
        `Connection: close\r\n\r\n`
    );
  });
}

// --- Test A: confirm the proxy's exit IP/country -------------------------

export type TestAResult = {
  ok: boolean;
  ms: number;
  ip?: string;
  country?: string;
  asn?: string | number;
  asnOrg?: string;
  city?: string;
  raw?: unknown;
  error?: string;
};

async function runTestA(proxy: ProxyConfig): Promise<TestAResult> {
  const start = Date.now();
  try {
    const rawSocket = await connectThroughProxy(proxy, GEO_CHECK_HOST, 443);
    const tlsSocket = await tlsUpgrade(rawSocket, GEO_CHECK_HOST);
    const { status, bodyPreview } = await rawHttpGet(tlsSocket, GEO_CHECK_HOST, GEO_CHECK_PATH);
    tlsSocket.destroy();
    if (status !== 200) {
      return { ok: false, ms: Date.now() - start, error: `HTTP ${status} from ${GEO_CHECK_HOST}` };
    }
    let parsed: {
      ip?: string;
      country?: string;
      asn?: { asnum?: number; org_name?: string };
      geo?: { city?: string };
    } = {};
    try {
      parsed = JSON.parse(bodyPreview);
    } catch {
      // Non-JSON response — still report ok with the raw text, don't fail the test over parsing.
    }
    return {
      ok: true,
      ms: Date.now() - start,
      ip: parsed.ip,
      country: parsed.country,
      asn: parsed.asn?.asnum,
      asnOrg: parsed.asn?.org_name,
      city: parsed.geo?.city,
      raw: parsed && Object.keys(parsed).length > 0 ? parsed : bodyPreview,
    };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: describeError(err) };
  }
}

// --- Test B: GDMS login page through the proxy, no credentials -----------

export type TestBResult = {
  tcpConnectOk: boolean;
  tlsHandshakeOk: boolean;
  httpOk: boolean;
  status?: number;
  bodyBytes?: number;
  ms: number;
  error?: string;
};

async function runTestB(proxy: ProxyConfig): Promise<TestBResult> {
  const start = Date.now();
  let rawSocket: net.Socket | undefined;
  try {
    rawSocket = await connectThroughProxy(proxy, GDMS_HOST, 443);
  } catch (err) {
    return { tcpConnectOk: false, tlsHandshakeOk: false, httpOk: false, ms: Date.now() - start, error: describeError(err) };
  }

  let tlsSocket: tls.TLSSocket;
  try {
    tlsSocket = await tlsUpgrade(rawSocket, GDMS_HOST);
  } catch (err) {
    return { tcpConnectOk: true, tlsHandshakeOk: false, httpOk: false, ms: Date.now() - start, error: describeError(err) };
  }

  try {
    const { status, bodyBytes } = await rawHttpGet(tlsSocket, GDMS_HOST, GDMS_LOGIN_PATH);
    tlsSocket.destroy();
    return { tcpConnectOk: true, tlsHandshakeOk: true, httpOk: status > 0, status, bodyBytes, ms: Date.now() - start };
  } catch (err) {
    return {
      tcpConnectOk: true,
      tlsHandshakeOk: true,
      httpOk: false,
      ms: Date.now() - start,
      error: describeError(err),
    };
  }
}

// --- Test C: real Playwright/Chromium navigation through the proxy -------

export type TestCResult = {
  ok: boolean;
  ms: number;
  httpStatus?: number;
  pageTitle?: string;
  usrIdFound?: boolean;
  usrPswdNoFound?: boolean;
  error?: string;
};

async function runTestC(proxy: ProxyConfig): Promise<TestCResult> {
  const start = Date.now();
  const browser = await chromium.launch({
    headless: true,
    proxy: { server: proxy.server, username: proxy.username, password: proxy.password },
  });
  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: false });
    const page = await context.newPage();
    const response = await page.goto(`https://${GDMS_HOST}${GDMS_LOGIN_PATH}`, {
      timeout: TIMEOUT_MS,
      waitUntil: "commit",
    });
    // Give the form a chance to actually render before checking for the fields.
    await page.locator("#usrId").waitFor({ state: "visible", timeout: TIMEOUT_MS }).catch(() => {});
    const [usrIdFound, usrPswdNoFound, pageTitle] = await Promise.all([
      page.locator("#usrId").count().then((c) => c > 0),
      page.locator("#usrPswdNo").count().then((c) => c > 0),
      page.title().catch(() => undefined),
    ]);
    return {
      ok: true,
      ms: Date.now() - start,
      httpStatus: response?.status(),
      pageTitle,
      usrIdFound,
      usrPswdNoFound,
    };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: describeError(err) };
  } finally {
    await browser.close().catch(() => {});
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

// --- Orchestration ---------------------------------------------------------

export type ProxyComparisonReport = {
  timestamp: string;
  proxyConfigured: boolean;
  proxyServer?: string; // host:port only — never contains credentials
  proxyUsernameMasked?: string;
  direct: ProbeReport;
  proxy?: { testA: TestAResult; testB: TestBResult; testC: TestCResult };
  error?: string;
};

export async function runProxyComparison(): Promise<ProxyComparisonReport> {
  const timestamp = new Date().toISOString();
  const direct = await runProbe();
  const proxyConfig = readProxyConfigFromEnv();

  if (!proxyConfig) {
    return {
      timestamp,
      proxyConfigured: false,
      direct,
      error: "TEST_PROXY_SERVER/TEST_PROXY_USERNAME/TEST_PROXY_PASSWORD not set — proxy tests skipped.",
    };
  }

  const [testA, testB, testC] = await Promise.all([
    runTestA(proxyConfig),
    runTestB(proxyConfig),
    runTestC(proxyConfig),
  ]);

  return {
    timestamp,
    proxyConfigured: true,
    proxyServer: proxyConfig.server,
    proxyUsernameMasked: maskUsername(proxyConfig.username),
    direct,
    proxy: { testA, testB, testC },
  };
}
