import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  jsonLdBlocks,
  langOf,
  linkTags,
  looksJsDriven,
  metaTags,
  resolveStylesheets,
  titleOf,
  visibleText,
} from "../lib/html";
import { fetchText, robotsAllows } from "../lib/http";
import { socialLinksFromHtml } from "../lib/social";
import { detectSourceType, normalizeUrl } from "../lib/url";

/** Coleta HTTP de uma fonte (RF-03): status, redirects, meta tags e dados estruturados. */
export default defineTool({
  description:
    "Faz HTTP GET de uma URL http(s) com resolução de redirect, checagem de robots.txt, retry/backoff e cache. " +
    "Devolve status, URL final, título, meta tags (Open Graph/Twitter), dados estruturados JSON-LD, texto visível resumido, " +
    "folhas de estilo, links sociais descobertos no HTML e o sinal `looksJsDriven`. " +
    "Use esta tool como primeiro passo para fontes do tipo `website`.",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL absoluta http(s) da fonte a coletar."),
    respectRobots: z
      .boolean()
      .optional()
      .describe("Padrão true. Quando true, respeita o robots.txt da origem (RNF-03)."),
    timeoutMs: z.number().int().min(1_000).max(30_000).optional().describe("Timeout por tentativa (padrão 15000ms)."),
    maxChars: z
      .number()
      .int()
      .min(200)
      .max(20_000)
      .optional()
      .describe("Limite de caracteres do texto devolvido (padrão 4000)."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    url: z.string(),
    finalUrl: z.string().optional(),
    status: z.number().int(),
    redirected: z.boolean().optional(),
    contentType: z.string().optional(),
    bytes: z.number().int().optional(),
    bodyTruncated: z.boolean().optional(),
    robotsAllowed: z.boolean(),
    title: z.string().optional(),
    description: z.string().optional(),
    lang: z.string().optional(),
    meta: z.record(z.string(), z.string()).optional(),
    structuredData: z.array(z.unknown()).optional(),
    stylesheets: z.array(z.string()).optional(),
    socialLinks: z.array(z.string()).optional(),
    sourceType: z.string().optional(),
    looksJsDriven: z.boolean().optional(),
    text: z.string().optional(),
    textLength: z.number().int().optional(),
    reason: z.string().optional(),
  }),
  label: { start: ({ url }) => `Coletar ${url}` },
  async execute({ url, respectRobots, timeoutMs, maxChars }) {
    const normalized = normalizeUrl(url);

    if (respectRobots !== false) {
      const allowed = await robotsAllows(normalized);
      if (!allowed) {
        return {
          ok: false,
          url: normalized,
          status: 0,
          robotsAllowed: false,
          reason: "bloqueado por robots.txt da origem",
        };
      }
    }

    const response = await fetchText(normalized, {
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });
    if (!response.ok) {
      return {
        ok: false,
        url: normalized,
        finalUrl: response.finalUrl,
        status: response.status,
        robotsAllowed: true,
        reason: response.reason,
      };
    }

    const html = response.body;
    const meta = metaTags(html);
    const blocks = jsonLdBlocks(html);
    const text = visibleText(html);
    const description = meta["og:description"] ?? meta["description"] ?? meta["twitter:description"];
    const title = titleOf(html);
    const lang = langOf(html);
    const stylesheets = linkTags(html)
      .filter((attrs) => (attrs["rel"] ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
      .map((attrs) => attrs["href"] ?? "")
      .filter((href) => href !== "");

    return {
      ok: true,
      url: normalized,
      finalUrl: response.finalUrl,
      status: response.status,
      redirected: response.finalUrl !== normalized,
      contentType: response.contentType,
      bytes: response.bytes,
      bodyTruncated: response.truncated,
      robotsAllowed: true,
      ...(title === undefined ? {} : { title }),
      ...(description === undefined ? {} : { description }),
      ...(lang === undefined ? {} : { lang }),
      meta,
      ...(blocks.length === 0 ? {} : { structuredData: blocks }),
      stylesheets: resolveStylesheets(stylesheets, response.finalUrl).slice(0, 10),
      socialLinks: socialLinksFromHtml(html, response.finalUrl),
      sourceType: detectSourceType(response.finalUrl),
      looksJsDriven: looksJsDriven(html),
      text: text.slice(0, maxChars ?? 4_000),
      textLength: text.length,
    };
  },
});
