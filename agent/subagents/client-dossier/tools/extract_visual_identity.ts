import { defineTool } from "eve/tools";
import { z } from "zod";

import { linkTags, resolveStylesheets } from "../lib/html";
import { fetchText, robotsAllows } from "../lib/http";
import type { MissingField } from "../lib/schema";
import { normalizeUrl } from "../lib/url";
import { extractVisualIdentity } from "../lib/visual-identity";

/**
 * Fragmento já no formato aceito pelo `build_dossier`: o agente só precisa
 * complementá-lo com os campos de negócio que ele mesmo derivou (RF-10).
 */
function websiteFragment(input: {
  url: string;
  status: "ok" | "failed";
  finalUrl?: string;
  reason?: string;
  visualIdentity?: {
    colors: readonly unknown[];
    typography: readonly unknown[];
    logo?: unknown;
    favicon?: unknown;
  };
  missing?: readonly MissingField[];
}) {
  return {
    source: {
      type: "website" as const,
      url: input.url,
      fetchedAt: new Date().toISOString(),
      status: input.status,
      ...(input.finalUrl === undefined ? {} : { finalUrl: input.finalUrl }),
      ...(input.reason === undefined ? {} : { reason: input.reason }),
    },
    ...(input.visualIdentity === undefined
      ? {}
      : {
          visualIdentity: {
            colors: input.visualIdentity.colors,
            typography: input.visualIdentity.typography,
            ...(input.visualIdentity.logo === undefined ? {} : { logo: input.visualIdentity.logo }),
            ...(input.visualIdentity.favicon === undefined
              ? {}
              : { favicon: input.visualIdentity.favicon }),
          },
        }),
    ...(input.missing === undefined ? {} : { missing: input.missing }),
  };
}

/** Identidade visual do site (RF-07): cores, tipografia, logo e favicon com fonte. */
export default defineTool({
  description:
    "Extrai a identidade visual de um site: cores com papel (primary/secondary/accent/background/text), tipografia " +
    "(heading/body), logo e favicon, cada item com a sua fonte de evidência. Baixa até `maxStylesheets` folhas de estilo " +
    "para analisar o CSS. Campos não encontrados voltam em `missing` (nunca inventados). Devolve também `fragment`, já " +
    "no formato aceito pelo `build_dossier` (fonte + identidade visual + missing): use-o como base do fragmento do site.",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL absoluta http(s) do site."),
    maxStylesheets: z
      .number()
      .int()
      .min(0)
      .max(8)
      .optional()
      .describe("Máximo de folhas de estilo analisadas (padrão 4)."),
    respectRobots: z.boolean().optional().describe("Padrão true."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    url: z.string(),
    finalUrl: z.string().optional(),
    status: z.number().int(),
    robotsAllowed: z.boolean(),
    colors: z
      .array(z.object({ role: z.string(), hex: z.string(), source: z.string() }))
      .optional(),
    typography: z.array(z.object({ role: z.string(), family: z.string(), source: z.string() })).optional(),
    logo: z
      .object({ url: z.string(), format: z.string().optional(), source: z.string() })
      .optional(),
    favicon: z.object({ url: z.string(), source: z.string() }).optional(),
    missing: z.array(z.object({ field: z.string(), reason: z.string() })).optional(),
    stylesheets: z
      .array(z.object({ url: z.string(), ok: z.boolean(), bytes: z.number().int(), reason: z.string().optional() }))
      .optional(),
    reason: z.string().optional(),
    /** Fragmento pronto para o `build_dossier` (fonte + identidade visual + missing). */
    fragment: z.unknown().optional(),
  }),
  label: { start: ({ url }) => `Extrair identidade visual de ${url}` },
  async execute({ url, maxStylesheets, respectRobots }) {
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
          fragment: websiteFragment({
            url: normalized,
            status: "failed",
            reason: "bloqueado por robots.txt da origem",
            missing: [
              {
                field: "website.visualIdentity",
                reason: "coleta bloqueada por robots.txt; nenhuma evidência visual disponível",
              },
            ],
          }),
        };
      }
    }

    const page = await fetchText(normalized, { timeoutMs: 20_000 });
    if (!page.ok) {
      return {
        ok: false,
        url: normalized,
        finalUrl: page.finalUrl,
        status: page.status,
        robotsAllowed: true,
        reason: page.reason,
        fragment: websiteFragment({
          url: normalized,
          status: "failed",
          finalUrl: page.finalUrl,
          reason: page.reason,
          missing: [
            {
              field: "website.visualIdentity",
              reason: `coleta falhou (${page.reason}); nenhuma evidência visual disponível`,
            },
          ],
        }),
      };
    }

    const hrefs = linkTags(page.body)
      .filter((attrs) => (attrs["rel"] ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
      .map((attrs) => attrs["href"] ?? "")
      .filter((href) => href !== "");
    const sheetUrls = resolveStylesheets(hrefs, page.finalUrl).slice(0, maxStylesheets ?? 4);

    const sheets = await Promise.all(
      sheetUrls.map(async (sheetUrl) => {
        const response = await fetchText(sheetUrl, { timeoutMs: 15_000, retries: 0, maxBytes: 500_000 });
        return response.ok
          ? { url: sheetUrl, ok: true, bytes: response.bytes, css: response.body }
          : { url: sheetUrl, ok: false, bytes: 0, css: "", reason: response.reason };
      }),
    );

    const result = extractVisualIdentity({
      html: page.body,
      css: sheets.map((sheet) => sheet.css).join("\n"),
      baseUrl: page.finalUrl,
    });

    return {
      ok: true,
      url: normalized,
      finalUrl: page.finalUrl,
      status: page.status,
      robotsAllowed: true,
      colors: result.colors.map((color) => ({ role: color.role, hex: color.hex, source: color.source })),
      typography: result.typography.map((entry) => ({
        role: entry.role,
        family: entry.family,
        source: entry.source,
      })),
      ...(result.logo === undefined
        ? {}
        : {
            logo: {
              url: result.logo.url,
              source: result.logo.source,
              ...(result.logo.format === undefined ? {} : { format: result.logo.format }),
            },
          }),
      ...(result.favicon === undefined ? {} : { favicon: result.favicon }),
      missing: result.missing,
      stylesheets: sheets.map((sheet) => ({
        url: sheet.url,
        ok: sheet.ok,
        bytes: sheet.bytes,
        ...(sheet.reason === undefined ? {} : { reason: sheet.reason }),
      })),
      fragment: websiteFragment({
        url: normalized,
        status: "ok",
        finalUrl: page.finalUrl,
        visualIdentity: {
          colors: result.colors.map((color) => ({ role: color.role, hex: color.hex, source: color.source })),
          typography: result.typography.map((entry) => ({
            role: entry.role,
            family: entry.family,
            source: entry.source,
          })),
          ...(result.logo === undefined
            ? {}
            : {
                logo: {
                  url: result.logo.url,
                  source: result.logo.source,
                  ...(result.logo.format === undefined ? {} : { format: result.logo.format }),
                },
              }),
          ...(result.favicon === undefined ? {} : { favicon: result.favicon }),
        },
        missing: result.missing,
      }),
    };
  },
});
