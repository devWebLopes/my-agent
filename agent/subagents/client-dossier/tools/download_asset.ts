import { createHash } from "node:crypto";

import { defineTool } from "eve/tools";
import { z } from "zod";

import { fetchBytes, robotsAllows } from "../lib/http";
import { assetKindSchema } from "../lib/schema";
import { normalizeUrl } from "../lib/url";
import { formatFromUrl } from "../lib/visual-identity";

const SECRET_PLACEHOLDER = "{GOOGLE_MAPS_API_KEY}";

/** Substitui o placeholder de segredo pela variável de ambiente, sem vazar a chave. */
function withSecret(rawUrl: string): { url: string; missingSecret?: string } {
  if (!rawUrl.includes(SECRET_PLACEHOLDER)) return { url: rawUrl };
  const key = process.env["GOOGLE_MAPS_API_KEY"];
  if (key === undefined || key === "") return { url: rawUrl, missingSecret: "GOOGLE_MAPS_API_KEY" };
  return { url: rawUrl.replaceAll(SECRET_PLACEHOLDER, key) };
}

/**
 * Baixa uma imagem para o workspace do sandbox e devolve o caminho local (RF-08).
 * Idempotente: o nome do arquivo é o hash do conteúdo, então reexecuções não duplicam assets.
 */
export default defineTool({
  description:
    "Baixa uma imagem (logo, foto, capa, favicon) para /workspace/assets/<kind>/<hash>.<ext> e devolve o caminho local, " +
    "o sha256 e o tamanho. URLs que contenham `{GOOGLE_MAPS_API_KEY}` têm a chave injetada no runtime, mantendo o segredo " +
    "fora do contexto do modelo. Reexecuções não duplicam arquivos (nome derivado do hash).",
  inputSchema: z.object({
    url: z.string().min(1).describe("URL absoluta http(s) da imagem."),
    kind: assetKindSchema.describe("Tipo do asset: logo, photo, cover, favicon ou other."),
    source: z.string().min(1).describe("Fonte de origem (URL da página/ficha de onde o asset veio)."),
    id: z.string().optional().describe("Id estável do asset no dossiê (padrão: <kind>-<hash curto>)."),
    alt: z.string().optional().describe("Texto alternativo publicado na origem, quando existir."),
    targetDir: z
      .string()
      .optional()
      .describe("Diretório relativo de destino para o asset (ex: dossiers/<slug>/runs/<runId>/assets/<kind>)."),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
    id: z.string().optional(),
    kind: z.string(),
    url: z.string(),
    finalUrl: z.string().optional(),
    status: z.number().int().optional(),
    localPath: z.string().optional(),
    sha256: z.string().optional(),
    bytes: z.number().int().optional(),
    contentType: z.string().optional(),
    format: z.string().optional(),
    source: z.string().optional(),
    alt: z.string().optional(),
    deduped: z.boolean().optional(),
    reason: z.string().optional(),
  }),
  label: { start: ({ kind, url }) => `Baixar ${kind} de ${url}` },
  async execute({ url, kind, source, id, alt, targetDir }, ctx) {
    const secret = withSecret(url);
    if (secret.missingSecret !== undefined) {
      return {
        ok: false,
        kind,
        url,
        source,
        reason: `a URL depende de ${secret.missingSecret}, que não está configurada no ambiente`,
      };
    }

    const allowed = await robotsAllows(secret.url);
    if (!allowed) {
      return { ok: false, kind, url, source, reason: "bloqueado por robots.txt da origem" };
    }

    const response = await fetchBytes(normalizeUrl(secret.url), { timeoutMs: 20_000, maxBytes: 8_000_000 });
    if (!response.ok) {
      return { ok: false, kind, url, source, status: response.status, reason: response.reason };
    }

    const contentType = (response.contentType.split(";")[0] ?? "").trim().toLowerCase();
    if (!contentType.startsWith("image/")) {
      return {
        ok: false,
        kind,
        url,
        source,
        status: response.status,
        reason: `content-type "${contentType}" não é imagem`,
      };
    }

    const sha256 = createHash("sha256").update(response.bytes).digest("hex");
    const digest = sha256.slice(0, 12);
    const format = formatFromUrl(response.finalUrl) ?? contentType.replace("image/", "");
    const extension = format === "svg+xml" ? "svg" : format;
    const baseDir = targetDir !== undefined && targetDir.trim() !== "" ? targetDir.replace(/\/+$/, "") : `assets/${kind}`;
    const relativePath = `${baseDir}/${digest}.${extension}`;

    const sandbox = await ctx.getSandbox();
    let deduped = false;
    try {
      const existing = await sandbox.readBinaryFile({ path: relativePath });
      deduped = existing !== null && existing.byteLength === response.bytes.byteLength;
    } catch {
      deduped = false;
    }
    if (!deduped) {
      await sandbox.writeBinaryFile({ path: relativePath, content: response.bytes });
    }

    return {
      ok: true,
      id: id ?? `${kind}-${digest}`,
      kind,
      url,
      finalUrl: response.finalUrl,
      status: response.status,
      localPath: sandbox.resolvePath(relativePath),
      sha256,
      bytes: response.bytes.byteLength,
      contentType,
      format,
      source,
      ...(alt === undefined ? {} : { alt }),
      deduped,
    };
  },
});
