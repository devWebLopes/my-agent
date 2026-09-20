import { anchors, jsonLdBlocks, jsonLdNodes, metaTags, visibleText } from "./html";
import type { ConfidenceLevel, SocialFragment } from "./schema";
import { detectSourceType, hostOf, isSocialHost, resolveUrl } from "./url";

/** Extração de perfil social a partir de página pública, sem autenticação (RF-06). */

export type SocialResult = {
  platform: string;
  url: string;
  handle?: string;
  title?: string;
  bio?: string;
  followers?: number;
  links?: string[];
  confidence: ConfidenceLevel;
  notes: string[];
};

const PLATFORM_BY_TYPE: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  linkedin: "linkedin",
  tiktok: "tiktok",
  youtube: "youtube",
};

/** Plataforma da rede social inferida pela URL. */
export function platformOf(url: string): string {
  const type = detectSourceType(url);
  const known = PLATFORM_BY_TYPE[type];
  if (known !== undefined) return known;
  if (/\b(x|twitter)\.com$/i.test(url) || /\/\/x\.com/i.test(url)) return "x";
  return "website";
}

const HANDLE_SKIP = new Set(["p", "reel", "reels", "explore", "stories", "tv", "watch", "share", "pages"]);

/** Handle/identificador público do perfil, quando a URL o expõe. */
export function handleOf(url: string): string | undefined {
  const platform = platformOf(url);
  let segments: string[];
  try {
    segments = new URL(url).pathname.split("/").filter((part) => part !== "");
  } catch {
    return undefined;
  }
  if (segments.length === 0) return undefined;

  if (platform === "linkedin") {
    const key = segments[0]?.toLowerCase();
    const value = key === "company" || key === "in" || key === "school" ? segments[1] : segments[0];
    return value === undefined || value === "" ? undefined : value.replace(/^@/, "");
  }
  if (platform === "youtube") {
    const first = segments[0] ?? "";
    const value = first.startsWith("@") ? first.slice(1) : (segments[1] ?? first);
    return value === "" ? undefined : value;
  }
  if (platform === "facebook" && segments[0]?.toLowerCase() === "pages") {
    return segments[1];
  }
  const candidate = segments[0] ?? "";
  if (HANDLE_SKIP.has(candidate.toLowerCase())) return undefined;
  return candidate.replace(/^@/, "");
}

const MULTIPLIERS: Record<string, number> = {
  "": 1,
  k: 1_000,
  mil: 1_000,
  m: 1_000_000,
  mi: 1_000_000,
  mn: 1_000_000,
  "milhão": 1_000_000,
  "milhões": 1_000_000,
  b: 1_000_000_000,
};

/** Converte "1,2 mil", "12.4K", "3.1M" em número. */
export function parseCompactNumber(value: string): number | undefined {
  const cleaned = value.trim().toLowerCase().replace(/[\s\u00a0]/g, "");
  const match = /^([\d.,]+)(k|m|b|mil|milhões|milhão|mi|mn)?$/.exec(cleaned);
  if (match === null) return undefined;
  const digits = match[1] ?? "";
  const suffix = match[2] ?? "";

  let normalized: string;
  if (/^\d{1,3}(\.\d{3})+$/.test(digits)) normalized = digits.replace(/\./g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(digits)) normalized = digits.replace(/,/g, "");
  else normalized = digits.replace(",", ".");

  const base = Number(normalized);
  if (!Number.isFinite(base)) return undefined;
  return Math.round(base * (MULTIPLIERS[suffix] ?? 1));
}

const FOLLOWER_RE =
  /([\d.,]+\s*(?:k|m|b|mil|milhões|milhão|mi)?)\s*(?:followers|seguidores|seguidoras|fans|subscribers|inscritos|inscritas)\b/i;

/** Seguidores declarados em textos públicos ("1,2 mil seguidores", "12.4K followers"). */
export function followersFromText(text: string): number | undefined {
  const match = FOLLOWER_RE.exec(text);
  if (match?.[1] === undefined) return undefined;
  return parseCompactNumber(match[1]);
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  if (typeof value === "string") return parseCompactNumber(value);
  return undefined;
}

function textField(node: Record<string, unknown>, key: string): string | undefined {
  const value = node[key];
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

/** Seguidores declarados em JSON-LD (`interactionStatistic.userInteractionCount`). */
export function followersFromJsonLd(nodes: readonly Record<string, unknown>[]): number | undefined {
  for (const node of nodes) {
    const statistics = node["interactionStatistic"];
    const list = Array.isArray(statistics) ? statistics : statistics === undefined ? [] : [statistics];
    for (const item of list) {
      if (item === null || typeof item !== "object") continue;
      const count = (item as Record<string, unknown>)["userInteractionCount"];
      const parsed = asNumber(count);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/** URLs `sameAs` declaradas em JSON-LD. */
export function sameAsFromJsonLd(nodes: readonly Record<string, unknown>[]): string[] {
  const links: string[] = [];
  for (const node of nodes) {
    const sameAs = node["sameAs"];
    if (typeof sameAs === "string") links.push(sameAs);
    if (Array.isArray(sameAs)) {
      for (const item of sameAs) if (typeof item === "string") links.push(item);
    }
  }
  return links;
}

/* ----------------------------------- extração ----------------------------------- */

const SHARE_URL_RE =
  /(facebook|twitter|x)\.com\/(sharer|share|intent)|linkedin\.com\/shareArticle|pinterest\.com\/pin\/create|api\.whatsapp\.com|wa\.me\/\?/i;

function dedupe(values: readonly string[]): string[] {
  return [...new Set(values)];
}

/** Links externos de uma página (sem âncoras internas nem widgets de compartilhamento). */
export function externalLinks(html: string, baseUrl: string): string[] {
  const baseHost = hostOf(baseUrl);
  const links: string[] = [];
  for (const anchor of anchors(html)) {
    const url = resolveUrl(baseUrl, anchor.href);
    if (url === undefined) continue;
    const host = hostOf(url);
    if (host === undefined || host === baseHost) continue;
    if (SHARE_URL_RE.test(url)) continue;
    links.push(url);
  }
  return dedupe(links).slice(0, 30);
}

/** Perfis sociais descobertos em uma página (ex.: rodapé do site). */
export function socialLinksFromHtml(html: string, baseUrl: string): string[] {
  return dedupe(externalLinks(html, baseUrl).filter((url) => isSocialHost(url))).slice(0, 12);
}

const BIO_BOILERPLATE_RE = [
  /\s*•\s*Instagram photos and videos.*$/i,
  /^\d[\d.,]*\s*(followers|seguidores)[^.]*\.\s*/i,
  /\s*See Instagram photos and videos from.*$/i,
  /\s*\|\s*Facebook\s*$/i,
  /\s*-\s*YouTube\s*$/i,
];

/** Remove boilerplate típico de bio de rede social. */
export function cleanBio(value: string): string {
  let bio = value.replace(/\s+/g, " ").trim();
  for (const pattern of BIO_BOILERPLATE_RE) bio = bio.replace(pattern, "").trim();
  return bio;
}

/** Perfil social a partir de HTML público (ou apenas da URL, quando a coleta falha). */
export function extractSocialProfile(input: {
  url: string;
  html?: string;
  fetchedOk?: boolean;
  fetchReason?: string;
}): SocialResult {
  const html = input.html ?? "";
  const meta = metaTags(html);
  const nodes = jsonLdNodes(jsonLdBlocks(html));
  const text = visibleText(html).slice(0, 8_000);

  const handle = handleOf(input.url);
  const title = meta["og:title"] ?? meta["twitter:title"];
  const rawBio = meta["og:description"] ?? meta["description"] ?? meta["twitter:description"];
  let bio = rawBio === undefined ? undefined : cleanBio(rawBio);
  if (bio === undefined || bio === "") {
    for (const node of nodes) {
      const value = textField(node, "description");
      if (value !== undefined) {
        bio = cleanBio(value);
        break;
      }
    }
  }
  if (bio === "") bio = undefined;

  const followers =
    (bio === undefined ? undefined : followersFromText(bio)) ??
    followersFromText(text) ??
    followersFromJsonLd(nodes);

  const links = dedupe([...sameAsFromJsonLd(nodes), ...externalLinks(html, input.url)]).slice(0, 25);

  const notes: string[] = ["coleta de página pública, sem autenticação"];
  let confidence: ConfidenceLevel = "low";
  if (bio !== undefined || followers !== undefined) confidence = "high";
  else if (title !== undefined) confidence = "medium";

  if (input.fetchedOk === false) {
    confidence = "low";
    notes.push(
      `página não coletada (${input.fetchReason ?? "motivo desconhecido"}); handle derivado da URL`,
    );
  }
  if (bio === undefined) notes.push("bio não encontrada no HTML público");
  if (followers === undefined) notes.push("contagem de seguidores não exposta publicamente");

  return {
    platform: platformOf(input.url),
    url: input.url,
    ...(handle === undefined ? {} : { handle }),
    ...(title === undefined || title === "" ? {} : { title }),
    ...(bio === undefined ? {} : { bio }),
    ...(followers === undefined ? {} : { followers }),
    ...(links.length === 0 ? {} : { links }),
    confidence,
    notes,
  };
}

/** Converte o resultado em fragmento consumido pelo `build_dossier`. */
export function toSocialFragment(result: SocialResult): SocialFragment {
  return {
    platform: result.platform,
    url: result.url,
    ...(result.handle === undefined ? {} : { handle: result.handle }),
    ...(result.bio === undefined ? {} : { bio: result.bio }),
    ...(result.followers === undefined ? {} : { followers: result.followers }),
    ...(result.links === undefined ? {} : { links: result.links }),
    source: result.url,
    confidence: result.confidence,
  };
}

