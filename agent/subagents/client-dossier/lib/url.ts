import type { SourceType } from "./schema";

/** Normalização, resolução e classificação de URLs (RF-02). */

const GENERIC_HOSTS = new Set([
  "example.com",
  "example.org",
  "example.net",
]);

/** Extrai hostname sem o prefixo `www.`, ou `undefined` quando a URL é inválida. */
export function hostOf(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    return parsed.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return undefined;
  }
}

/** Aceita apenas URLs absolutas http(s). */
export function isHttpUrl(url: string): boolean {
  return hostOf(url) !== undefined;
}

export function cleanCnpj(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCnpj(raw: string): boolean {
  const digits = cleanCnpj(raw);
  if (digits.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(digits)) return false;

  const calc = (slice: string, factor: number) => {
    let sum = 0;
    for (const char of slice) {
      sum += Number(char) * factor;
      factor = factor === 2 ? 9 : factor - 1;
    }
    const remainder = sum % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const digit1 = calc(digits.slice(0, 12), 5);
  const digit2 = calc(digits.slice(0, 13), 6);
  return digit1 === Number(digits[12]) && digit2 === Number(digits[13]);
}

export function formatCnpj(raw: string): string {
  const d = cleanCnpj(raw);
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12, 14)}`;
}

/** Garante esquema absoluto, remove fragmento e normaliza o caminho. */
export function normalizeUrl(raw: string, base?: string): string {
  const trimmed = raw.trim();
  if (
    trimmed.toLowerCase().startsWith("cnpj:") ||
    isValidCnpj(trimmed) ||
    (cleanCnpj(trimmed).length === 14 && /^[0-9./-]+$/.test(trimmed))
  ) {
    return `cnpj:${cleanCnpj(trimmed)}`;
  }

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : base !== undefined
      ? new URL(trimmed, base).toString()
      : `https://${trimmed}`;

  const parsed = new URL(candidate);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported URL scheme: ${parsed.protocol}`);
  }
  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();
  return parsed.toString();
}

/** Resolve um `href` relativo contra a URL da página, devolvendo `undefined` se inválido. */
export function resolveUrl(base: string, href: string): string | undefined {
  const trimmed = href.trim();
  if (trimmed === "" || trimmed.startsWith("data:") || trimmed.startsWith("javascript:")) {
    return undefined;
  }
  if (trimmed.startsWith("#")) return undefined;
  try {
    const resolved = new URL(trimmed, base);
    resolved.hash = "";
    return resolved.toString();
  } catch {
    return undefined;
  }
}

/** Origem (`https://host`) usada para `robots.txt` e favicons relativos. */
export function originOf(url: string): string {
  if (url.startsWith("cnpj:")) return "cnpj:";
  return new URL(url).origin;
}

/** Caminho + query, usado em checagens de `robots.txt`. */
export function pathOf(url: string): string {
  if (url.startsWith("cnpj:")) return url;
  const parsed = new URL(url);
  return `${parsed.pathname}${parsed.search}`;
}

/** Classifica a fonte pela URL quando o chamador não informa o `type`. */
export function detectSourceType(url: string): SourceType {
  const trimmed = url.trim();
  if (
    trimmed.toLowerCase().startsWith("cnpj:") ||
    isValidCnpj(trimmed) ||
    (cleanCnpj(trimmed).length === 14 && /^[0-9./-]+$/.test(trimmed))
  ) {
    return "cnpj";
  }

  const host = hostOf(url);
  const lower = url.toLowerCase();
  if (host === undefined) return "other";

  if (
    host === "maps.google.com" ||
    host.endsWith(".maps.google.com") ||
    host === "maps.app.goo.gl" ||
    host === "goo.gl" ||
    host === "g.co" ||
    (host.endsWith("google.com") && lower.includes("/maps"))
  ) {
    return "google_maps";
  }
  if (host === "instagram.com" || host.endsWith(".instagram.com")) return "instagram";
  if (host === "facebook.com" || host.endsWith(".facebook.com") || host === "fb.me" || host === "fb.com") {
    return "facebook";
  }
  if (host === "linkedin.com" || host.endsWith(".linkedin.com") || host === "lnkd.in") return "linkedin";
  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) return "tiktok";
  if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") return "youtube";
  if (GENERIC_HOSTS.has(host)) return "website";
  return "website";
}

/** Hosts que representam plataformas sociais conhecidas. */
export function isSocialHost(url: string): boolean {
  const type = detectSourceType(url);
  return type !== "website" && type !== "google_maps" && type !== "other";
}

/** Slug estável para ids de dossiê, diretórios e nomes de arquivo. */
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " e ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
