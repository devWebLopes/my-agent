import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  cleanContent,
  contactLinks,
  headings,
  jsonLdBlocks,
  looksJsDriven,
  sectionsOf,
  titleOf,
  visibleText,
} from "../lib/html";
import { fetchText, robotsAllows } from "../lib/http";
import { socialLinksFromHtml } from "../lib/social";
import { normalizeUrl } from "../lib/url";

/**
 * Leitura estruturada de uma página (RF-03): títulos, seções, contatos e JSON-LD.
 * Fallback para páginas "JS-heavy" — ATENÇÃO: não executa JavaScript (sem browser
 * headless); quando `requiresRendering` for true, registre a limitação no dossiê.
 */
export default defineTool({
  description:
    "Extrai conteúdo estruturado de uma página: título, cabeçalhos, seções de texto, e-mails/telefones, JSON-LD e links sociais. " +
    "Não executa JavaScript (sem browser headless): se `requiresRendering` vier true, a página depende de JS — " +
    "registre a limitação em `missing` e complemente com outras fontes.",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL absoluta http(s) da página."),
    maxSections: z.number().int().min(1).max(40).optional().describe("Máximo de seções devolvidas (padrão 12)."),
    maxChars: z.number().int().min(500).max(40_000).optional().describe("Limite de texto total (padrão 12000)."),
    respectRobots: z.boolean().optional().describe("Padrão true."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    url: z.string(),
    finalUrl: z.string().optional(),
    status: z.number().int(),
    robotsAllowed: z.boolean(),
    title: z.string().optional(),
    headings: z.array(z.object({ level: z.number().int(), text: z.string() })).optional(),
    sections: z.array(z.object({ heading: z.string().optional(), text: z.string() })).optional(),
    text: z.string().optional(),
    cleanText: z.string().optional(),
    textLength: z.number().int().optional(),
    structuredData: z.array(z.unknown()).optional(),
    emails: z.array(z.string()).optional(),
    phones: z.array(z.string()).optional(),
    socialLinks: z.array(z.string()).optional(),
    requiresRendering: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  label: { start: ({ url }) => `Ler página ${url}` },
  async execute({ url, maxSections, maxChars, respectRobots }) {
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

    const response = await fetchText(normalized, { timeoutMs: 20_000 });
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
    const limit = maxChars ?? 12_000;
    const text = visibleText(html);
    const cleaned = cleanContent(html);
    const title = titleOf(html);
    const contacts = contactLinks(html);
    const blocks = jsonLdBlocks(html);

    return {
      ok: true,
      url: normalized,
      finalUrl: response.finalUrl,
      status: response.status,
      robotsAllowed: true,
      ...(title === undefined ? {} : { title }),
      headings: headings(html).slice(0, (maxSections ?? 12) * 2),
      sections: sectionsOf(html)
        .slice(0, maxSections ?? 12)
        .map((item) => (item.heading === undefined ? { text: item.text } : item)),
      text: text.slice(0, limit),
      cleanText: cleaned.slice(0, limit),
      textLength: text.length,
      ...(blocks.length === 0 ? {} : { structuredData: blocks }),
      ...(contacts.emails.length === 0 ? {} : { emails: contacts.emails.slice(0, 10) }),
      ...(contacts.phones.length === 0 ? {} : { phones: contacts.phones.slice(0, 10) }),
      socialLinks: socialLinksFromHtml(html, response.finalUrl),
      requiresRendering: looksJsDriven(html),
    };
  },
});
