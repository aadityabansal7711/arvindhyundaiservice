import * as dns from "node:dns/promises";
import * as net from "node:net";
import * as tls from "node:tls";
import * as https from "node:https";
import * as os from "node:os";

/**
 * Layer-by-layer network diagnostic for GDMS (ndms.hmil.net) — isolates
 * *where* connectivity fails (DNS vs raw TCP vs TLS/SNI vs full HTTP), and
 * separately checks IPv4 vs IPv6, so results from different hosts (this
 * machine, Railway, a future Indian VPS) are directly comparable.
 *
 * Deliberately has zero dependency on gdms-service — this never touches the
 * Playwright login flow, credentials, or proxy config. It only ever loads
 * the public, unauthenticated login page, same as any browser visiting the
 * site does.
 */

const TARGET_HOST = "ndms.hmil.net";
const TARGET_PATH = "/cmm/cmmi/selectLoginMain.dms";
const TIMEOUT_MS = 10_000;

type Timed<T> = T & { ms: number };

async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
  const start = Date.now();
  const result = await fn();
  return { ...result, ms: Date.now() - start };
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

// --- DNS -------------------------------------------------------------

type DnsResult = { ok: boolean; addresses?: string[]; error?: string };

async function checkDnsA(): Promise<DnsResult> {
  try {
    const addresses = await withTimeout(dns.resolve4(TARGET_HOST), TIMEOUT_MS, "DNS A lookup");
    return { ok: addresses.length > 0, addresses };
  } catch (err) {
    return { ok: false, error: describeError(err) };
  }
}

async function checkDnsAAAA(): Promise<DnsResult> {
  try {
    const addresses = await withTimeout(dns.resolve6(TARGET_HOST), TIMEOUT_MS, "DNS AAAA lookup");
    return { ok: addresses.length > 0, addresses };
  } catch (err) {
    // ENODATA/ENOTFOUND just means "no AAAA records" — not a failure worth alarming over.
    return { ok: false, error: describeError(err) };
  }
}

// --- Raw TCP :443 ------------------------------------------------------

type TcpResult = { ok: boolean; ip: string; error?: string };

function checkTcp443(ip: string, family: 4 | 6): Promise<TcpResult> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port: 443, family, timeout: TIMEOUT_MS });
    const finish = (ok: boolean, error?: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, ip, error });
    };
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false, `TCP connect timed out after ${TIMEOUT_MS}ms`));
    socket.once("error", (err) => finish(false, describeError(err)));
  });
}

// --- TLS handshake with correct SNI ------------------------------------

type TlsResult = {
  ok: boolean;
  ip: string;
  protocol?: string;
  cipher?: string;
  subject?: string;
  issuer?: string;
  error?: string;
};

function firstOrSelf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// `ip` is always a literal IPv4/IPv6 address here (never a hostname), so no
// `family` hint is needed — that only matters when Node has to resolve one.
function checkTlsHandshake(ip: string): Promise<TlsResult> {
  return new Promise((resolve) => {
    const socket = tls.connect({
      host: ip,
      port: 443,
      servername: TARGET_HOST, // SNI — must be the real hostname, not the IP
      timeout: TIMEOUT_MS,
      rejectUnauthorized: false, // we want to see handshake success even if the cert itself looked odd
    });
    const finish = (ok: boolean, extra: Partial<TlsResult> = {}, error?: string) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve({ ok, ip, ...extra, error });
    };
    socket.once("secureConnect", () => {
      const cert = socket.getCertificate();
      finish(true, {
        protocol: socket.getProtocol() ?? undefined,
        cipher: socket.getCipher()?.name,
        subject: cert && "subject" in cert ? firstOrSelf(cert.subject?.CN) : undefined,
        issuer: cert && "issuer" in cert ? firstOrSelf(cert.issuer?.CN) : undefined,
      });
    });
    socket.once("timeout", () => finish(false, {}, `TLS handshake timed out after ${TIMEOUT_MS}ms`));
    socket.once("error", (err) => finish(false, {}, describeError(err)));
  });
}

// --- Full HTTPS request (forced to a specific IP family, or default resolution) ---

type HttpResult = { ok: boolean; status?: number; contentLength?: number; error?: string };

function checkHttpsRequest(opts: { ip?: string; family?: 4 | 6 }): Promise<HttpResult> {
  return new Promise((resolve) => {
    const req = https.request(
      {
        host: opts.ip ?? TARGET_HOST,
        servername: TARGET_HOST, // SNI always the real hostname
        headers: { Host: TARGET_HOST },
        path: TARGET_PATH,
        family: opts.family,
        timeout: TIMEOUT_MS,
        rejectUnauthorized: false,
      },
      (res) => {
        let length = 0;
        res.on("data", (chunk: Buffer) => {
          length += chunk.length;
        });
        res.on("end", () => resolve({ ok: true, status: res.statusCode, contentLength: length }));
        res.on("error", (err) => resolve({ ok: false, error: describeError(err) }));
      }
    );
    req.once("timeout", () => {
      req.destroy();
      resolve({ ok: false, error: `HTTP request timed out after ${TIMEOUT_MS}ms` });
    });
    req.once("error", (err) => resolve({ ok: false, error: describeError(err) }));
    req.end();
  });
}

// --- Outbound public IP / ASN / country --------------------------------

type OutboundIpResult = {
  ok: boolean;
  ip?: string;
  asn?: string;
  org?: string;
  country?: string;
  error?: string;
};

async function checkOutboundIpViaIpapi(): Promise<OutboundIpResult> {
  const res = await withTimeout(fetch("https://ipapi.co/json/"), TIMEOUT_MS, "Outbound IP lookup");
  if (!res.ok) throw new Error(`ipapi.co returned HTTP ${res.status}`);
  const json = (await res.json()) as { ip?: string; asn?: string; org?: string; country_name?: string };
  return { ok: true, ip: json.ip, asn: json.asn, org: json.org, country: json.country_name };
}

async function checkOutboundIpViaIfconfigCo(): Promise<OutboundIpResult> {
  const res = await withTimeout(fetch("https://ifconfig.co/json"), TIMEOUT_MS, "Outbound IP lookup");
  if (!res.ok) throw new Error(`ifconfig.co returned HTTP ${res.status}`);
  const json = (await res.json()) as { ip?: string; asn?: string; asn_org?: string; country?: string };
  return { ok: true, ip: json.ip, asn: json.asn, org: json.asn_org, country: json.country };
}

/** ipapi.co's free tier rate-limits easily under repeated testing — fall back to ifconfig.co rather than lose this field. */
async function checkOutboundIp(): Promise<OutboundIpResult> {
  try {
    return await checkOutboundIpViaIpapi();
  } catch (primaryErr) {
    try {
      return await checkOutboundIpViaIfconfigCo();
    } catch (fallbackErr) {
      return {
        ok: false,
        error: `ipapi.co: ${describeError(primaryErr)}; ifconfig.co: ${describeError(fallbackErr)}`,
      };
    }
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) {
    const code = (err as NodeJS.ErrnoException).code;
    return code ? `${code}: ${err.message}` : err.message;
  }
  return String(err);
}

// --- Orchestration -------------------------------------------------------

export type ProbeReport = {
  target: string;
  environment: string;
  timestamp: string;
  dns: { a: Timed<DnsResult>; aaaa: Timed<DnsResult> };
  tcp443: Timed<TcpResult> | null;
  tls: Timed<TlsResult> | null;
  forcedIPv4Http: Timed<HttpResult> | null;
  forcedIPv6Http: (Timed<HttpResult> & { attempted: boolean }) | null;
  defaultHttp: Timed<HttpResult>;
  outboundIp: Timed<OutboundIpResult>;
};

export async function runProbe(): Promise<ProbeReport> {
  const environment = process.env.PROBE_ENV_LABEL || os.hostname();
  const timestamp = new Date().toISOString();

  const [a, aaaa] = await Promise.all([timed(checkDnsA), timed(checkDnsAAAA)]);

  const ipv4Address = a.ok && a.addresses ? a.addresses[0] : null;
  const ipv6Address = aaaa.ok && aaaa.addresses ? aaaa.addresses[0] : null;

  const tcp443 = ipv4Address ? await timed(() => checkTcp443(ipv4Address, 4)) : null;
  const tlsResult = ipv4Address ? await timed(() => checkTlsHandshake(ipv4Address)) : null;
  const forcedIPv4Http = ipv4Address
    ? await timed(() => checkHttpsRequest({ ip: ipv4Address, family: 4 }))
    : null;

  let forcedIPv6Http: (Timed<HttpResult> & { attempted: boolean }) | null = null;
  if (ipv6Address) {
    const result = await timed(() => checkHttpsRequest({ ip: ipv6Address, family: 6 }));
    forcedIPv6Http = { ...result, attempted: true };
  }

  // The "ground truth" request — normal DNS resolution, no forced IP, closest
  // to what a real browser/undici fetch actually does.
  const defaultHttp = await timed(() => checkHttpsRequest({}));

  const outboundIp = await timed(checkOutboundIp);

  return {
    target: `https://${TARGET_HOST}${TARGET_PATH}`,
    environment,
    timestamp,
    dns: { a, aaaa },
    tcp443,
    tls: tlsResult,
    forcedIPv4Http,
    forcedIPv6Http,
    defaultHttp,
    outboundIp,
  };
}
