import { originOf, pathOf } from "./url";

/**
 * Camada HTTP compartilhada pelas tools: timeout, retry/backoff, `robots.txt`,
 * limite de tamanho e cache por URL (RNF-01, RNF-02, RNF-03, RNF-07).
 */

export const USER_AGENT =
  "client-dossier/1.0 (eve agent; coleta de presença online pública; +https://eve.dev)";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_BYTES = 3_000_000;
const RETRY_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 40;

export type FetchTextSuccess = {
  ok: true;
  status: number;
  finalUrl: string;
  contentType: string;
  body: string;
  bytes: number;
  truncated: boolean;
};

export type FetchFailure = {
  ok: false;
  status: number;
  finalUrl: string;
  reason: string;
};

export type FetchTextResult = FetchTextSuccess | FetchFailure;

const textCache = new Map<string, { expires: number; result: FetchTextResult }>();

function readCache(url: string): FetchTextResult | undefined {
  const entry = textCache.get(url);
  if (entry === undefined) return undefined;
  if (entry.expires < Date.now()) {
    textCache.delete(url);
    return undefined;
  }
  return entry.result;
}

function writeCache(url: string, result: FetchTextResult): void {
  if (textCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = textCache.keys().next();
    if (!oldest.done) textCache.delete(oldest.value);
  }
  textCache.set(url, { expires: Date.now() + CACHE_TTL_MS, result });
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function describeError(error: unknown, timeoutMs: number): string {
  if (error instanceof Error) {
    return error.name === "TimeoutError" ? `timeout após ${timeoutMs}ms` : error.message;
  }
  return String(error);
}

export type FetchOptions = {
  timeoutMs?: number;
  maxBytes?: number;
  retries?: number;
  userAgent?: string;
  useCache?: boolean;
};

/** GET de texto com retry/backoff, limite de bytes e cache por URL. */
export async function fetchText(url: string, options: FetchOptions = {}): Promise<FetchTextResult> {
  const cacheable = options.useCache !== false;
  if (cacheable) {
    const cached = readCache(url);
    if (cached !== undefined) return cached;
  }

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const retries = options.retries ?? 2;
  const headers = {
    "user-agent": options.userAgent ?? USER_AGENT,
    accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    "accept-language": "pt-BR,pt;q=0.9,en;q=0.8",
  };

  let status = 0;
  let finalUrl = url;
  let reason = "erro desconhecido";

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        redirect: "follow",
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      status = response.status;
      finalUrl = response.url === "" ? url : response.url;

      if (response.ok) {
        const buffer = await response.arrayBuffer();
        const bytes = buffer.byteLength;
        const truncated = bytes > maxBytes;
        const body = new TextDecoder("utf-8").decode(truncated ? buffer.slice(0, maxBytes) : buffer);
        const result: FetchTextSuccess = {
          ok: true,
          status,
          finalUrl,
          contentType: response.headers.get("content-type") ?? "",
          body,
          bytes,
          truncated,
        };
        if (cacheable) writeCache(url, result);
        return result;
      }

      reason = `HTTP ${status}`;
      if (!RETRY_STATUS.has(status)) {
        const failure: FetchFailure = { ok: false, status, finalUrl, reason };
        // Falhas definitivas (403/404) também são cacheadas: a coleta é idempotente.
        if (cacheable) writeCache(url, failure);
        return failure;
      }
    } catch (error) {
      reason = describeError(error, timeoutMs);
    }

    if (attempt < retries) await delay(400 * 2 ** attempt);
  }

  return { ok: false, status, finalUrl, reason };
}

export type FetchBytesResult =
  | { ok: true; status: number; finalUrl: string; contentType: string; bytes: Uint8Array }
  | FetchFailure;
/** GET de bytes (imagens) com timeout e limite de tamanho (RF-08). */
export async function fetchBytes(url: string, options: FetchOptions = {}): Promise<FetchBytesResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? 8_000_000;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "user-agent": options.userAgent ?? USER_AGENT, accept: "image/*,*/*;q=0.8" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      return { ok: false, status: response.status, finalUrl: response.url, reason: `HTTP ${response.status}` };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > maxBytes) {
      return {
        ok: false,
        status: response.status,
        finalUrl: response.url,
        reason: `arquivo maior que o limite de ${maxBytes} bytes`,
      };
    }
    return {
      ok: true,
      status: response.status,
      finalUrl: response.url,
      contentType: response.headers.get("content-type") ?? "",
      bytes,
    };
  } catch (error) {
    return { ok: false, status: 0, finalUrl: url, reason: describeError(error, timeoutMs) };
  }
}

/* ---------------------------------- robots.txt ---------------------------------- */

type RobotsRules = { disallow: string[]; allow: string[] };

const robotsCache = new Map<string, RobotsRules | null>();

function parseRobots(text: string, token: string): RobotsRules {
  type Group = { agents: string[]; disallow: string[]; allow: string[] };
  const groups: Group[] = [];
  let current: Group | undefined;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0]?.trim() ?? "";
    if (line === "") continue;
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (key === "user-agent") {
      if (current === undefined || current.disallow.length > 0 || current.allow.length > 0) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      continue;
    }
    if (current === undefined) continue;
    if (key === "disallow" && value !== "") current.disallow.push(value);
    if (key === "allow" && value !== "") current.allow.push(value);
  }

  const group = groups.find((candidate) =>
    candidate.agents.some(
      (agent) => agent === "*" || agent.includes(token.toLowerCase()) || token.toLowerCase().includes(agent),
    ),
  );
  return { disallow: group?.disallow ?? [], allow: group?.allow ?? [] };
}

function longestPrefixLength(patterns: readonly string[], path: string): number {
  let best = -1;
  for (const pattern of patterns) {
    const prefix = pattern.split("*")[0] ?? "";
    if (prefix !== "" && path.startsWith(prefix) && prefix.length > best) best = prefix.length;
  }
  return best;
}

/** Consulta `robots.txt` da origem (com cache) e diz se o caminho pode ser coletado. */
export async function robotsAllows(url: string, token = "client-dossier"): Promise<boolean> {
  const origin = originOf(url);
  let rules = robotsCache.get(origin);
  if (rules === undefined) {
    const response = await fetchText(`${origin}/robots.txt`, {
      timeoutMs: 8_000,
      retries: 0,
      maxBytes: 200_000,
    });
    rules = response.ok ? parseRobots(response.body, token) : null;
    robotsCache.set(origin, rules);
  }
  if (rules === null) return true;

  const path = pathOf(url);
  const disallowLength = longestPrefixLength(rules.disallow, path);
  if (disallowLength < 0) return true;
  return longestPrefixLength(rules.allow, path) >= disallowLength;
}
