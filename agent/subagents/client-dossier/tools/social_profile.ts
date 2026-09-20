import { defineTool } from "eve/tools";
import { z } from "zod";

import { fetchText, robotsAllows } from "../lib/http";
import { extractSocialProfile, toSocialFragment } from "../lib/social";
import { detectSourceType, isSocialHost, normalizeUrl } from "../lib/url";

/** Perfil de rede social público, sem autenticação (RF-06). */

const PLATFORM_LABEL_RE = /\s*(\|\s*(Facebook|LinkedIn)|•\s*Instagram.*|-\s*YouTube)\s*$/i;

/** Título do perfil limpo, quando parece ser o nome do negócio/pessoa. */
export function looksLikeName(title: string): string | undefined {
  const cleaned = title.replace(PLATFORM_LABEL_RE, "").trim();
  if (cleaned === "" || cleaned.length > 90) return undefined;
  if (/[@|·]|photos|videos|posts|followers|seguidores/i.test(cleaned)) return undefined;
  return cleaned;
}

async function youTubeOembed(
  url: string,
): Promise<{ title?: string; author?: string; thumbnail?: string }> {
  const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetchText(endpoint, { timeoutMs: 8_000, retries: 0, maxBytes: 100_000 });
  if (!response.ok) return {};
  try {
    const data = JSON.parse(response.body) as Record<string, unknown>;
    return {
      ...(typeof data["title"] === "string" ? { title: data["title"] } : {}),
      ...(typeof data["author_name"] === "string" ? { author: data["author_name"] } : {}),
      ...(typeof data["thumbnail_url"] === "string" ? { thumbnail: data["thumbnail_url"] } : {}),
    };
  } catch {
    return {};
  }
}


/** Perfil social como fragmento pronto para o `build_dossier`. */
export default defineTool({
  description:
    "Coleta um perfil de rede social público (Instagram, Facebook, LinkedIn, TikTok, YouTube, X) sem autenticação: " +
    "handle, bio, seguidores e links (Open Graph, JSON-LD e oEmbed do YouTube). " +
    "Quando a plataforma bloqueia a coleta, ainda devolve o handle derivado da URL com confiança `low` e o motivo em `missing`. " +
    "O campo `fragment` já está no formato aceito pelo `build_dossier`.",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL absoluta do perfil público."),
    respectRobots: z.boolean().optional().describe("Padrão true."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    platform: z.string(),
    url: z.string(),
    handle: z.string().optional(),
    title: z.string().optional(),
    bio: z.string().optional(),
    followers: z.number().optional(),
    links: z.array(z.string()).optional(),
    thumbnailUrl: z.string().optional(),
    confidence: z.string(),
    notes: z.array(z.string()).optional(),
    fragment: z.unknown().optional(),
    reason: z.string().optional(),
  }),
  label: { start: ({ url }) => `Coletar perfil social ${url}` },
  async execute({ url, respectRobots }) {
    const normalized = normalizeUrl(url);
    const sourceType = detectSourceType(normalized);

    let html: string | undefined;
    let fetchedOk = true;
    let reason: string | undefined;
    if (respectRobots !== false) {
      const allowed = await robotsAllows(normalized);
      if (!allowed) {
        fetchedOk = false;
        reason = "bloqueado por robots.txt da origem";
      }
    }
    if (fetchedOk) {
      const response = await fetchText(normalized, { timeoutMs: 15_000, retries: 1 });
      if (response.ok) html = response.body;
      else {
        fetchedOk = false;
        reason = response.reason;
      }
    }

    const profile = extractSocialProfile({
      url: normalized,
      ...(html === undefined ? {} : { html }),
      fetchedOk,
      ...(reason === undefined ? {} : { fetchReason: reason }),
    });

    const oembed =
      profile.platform === "youtube"
        ? await youTubeOembed(normalized)
        : ({} as { title?: string; thumbnail?: string });
    const title = profile.title ?? oembed.title;

    const website = (profile.links ?? []).find((link) => !isSocialHost(link));
    const nameCandidate = title === undefined ? undefined : looksLikeName(title);
    const sourceLabel = `${profile.platform}:${normalized}`;
    const business = {
      ...(nameCandidate === undefined
        ? {}
        : { name: { value: nameCandidate, source: sourceLabel, confidence: "medium" } }),
      ...(website === undefined
        ? {}
        : { website: { value: website, source: sourceLabel, confidence: "low" } }),
    };

    const missing: { field: string; reason: string }[] = [];
    if (!fetchedOk) {
      missing.push({
        field: `social.${profile.platform}`,
        reason: `coleta bloqueada/falhou (${reason ?? "motivo desconhecido"}); apenas o handle da URL está disponível`,
      });
    }
    if (profile.bio === undefined) {
      missing.push({
        field: `social.${profile.platform}.bio`,
        reason: "bio não publicada em HTML público",
      });
    }
    if (profile.followers === undefined) {
      missing.push({
        field: `social.${profile.platform}.followers`,
        reason: "contagem de seguidores não exposta publicamente",
      });
    }

    return {
      ok: fetchedOk,
      platform: profile.platform,
      url: normalized,
      ...(profile.handle === undefined ? {} : { handle: profile.handle }),
      ...(title === undefined ? {} : { title }),
      ...(profile.bio === undefined ? {} : { bio: profile.bio }),
      ...(profile.followers === undefined ? {} : { followers: profile.followers }),
      ...(profile.links === undefined ? {} : { links: profile.links }),
      ...(oembed.thumbnail === undefined ? {} : { thumbnailUrl: oembed.thumbnail }),
      confidence: profile.confidence,
      notes: profile.notes,
      ...(reason === undefined ? {} : { reason }),
      fragment: {
        source: {
          type: sourceType,
          url: normalized,
          fetchedAt: new Date().toISOString(),
          status: fetchedOk ? "ok" : "partial",
          ...(title === undefined ? {} : { title }),
          ...(reason === undefined ? {} : { reason }),
        },
        social: [toSocialFragment(profile)],
        ...(Object.keys(business).length === 0 ? {} : { business }),
        missing,
      },
    };
  },
});

