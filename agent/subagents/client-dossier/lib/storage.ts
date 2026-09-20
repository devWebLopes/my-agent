import { z } from "zod";

import { sourceRecordSchema, type Dossier, type DossierRequest } from "./schema";
import { hostOf, slugify } from "./url";

/**
 * Schemas e utilitários para organização de diretórios e persistência de dossiês (PRD-organizacao-dossies-pastas).
 */

export const manifestSchema = z.object({
  query: z.string().optional().describe("Termo ou nome original da pesquisa."),
  entitySlug: z.string().describe("Slug identificador do que foi pesquisado."),
  runId: z.string().describe("Identificador único e ordenável da consulta (timestamp_hash)."),
  executedAt: z.string().describe("Data e hora de execução em ISO 8601."),
  durationMs: z.number().int().optional().describe("Duração total da coleta em milissegundos."),
  status: z.enum(["complete", "partial", "failed"]).describe("Status final da consolidação."),
  version: z.number().int().min(1).describe("Versão do dossiê para esta entidade."),
  sources: z.array(sourceRecordSchema).describe("Lista de fontes consultadas com seus status."),
  stats: z.object({
    assetsDownloaded: z.number().int().nonnegative(),
    confidenceHighCount: z.number().int().nonnegative(),
    missingFieldsCount: z.number().int().nonnegative(),
  }),
  paths: z.object({
    dossierJson: z.string().describe("Caminho relativo do dossier.json gerado."),
    dossierMarkdown: z.string().describe("Caminho relativo do dossie.md gerado."),
    assetsDir: z.string().describe("Caminho relativo da pasta de assets da consulta."),
  }),
});

export type Manifest = z.infer<typeof manifestSchema>;

export const catalogEntrySchema = z.object({
  entitySlug: z.string(),
  name: z.string(),
  lastRunId: z.string(),
  lastExecutedAt: z.string(),
  status: z.enum(["complete", "partial", "failed"]),
  version: z.number().int().min(1),
  latestDossierJson: z.string(),
  latestMarkdown: z.string(),
  runsCount: z.number().int().min(1),
});

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

export const catalogSchema = z.object({
  updatedAt: z.string(),
  entries: z.array(catalogEntrySchema),
});

export type Catalog = z.infer<typeof catalogSchema>;

/** Hash FNV-1a curto de 6 caracteres hexadecimais. */
export function shortHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0").slice(0, 6);
}

/** Formata data para o padrão de ordenação de diretório: YYYY-MM-DD_HH-mm-ss */
export function formatRunTimestamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`;
}

/**
 * Deriva o slug identificador do que foi pesquisado.
 * Prioriza: request.name -> businessName extraído -> request.clientId -> domínio da fonte principal.
 */
export function entitySlugOf(request: DossierRequest, businessName?: string): string {
  const rawCandidate =
    (request.name !== undefined && request.name.trim() !== "" ? request.name : undefined) ??
    (businessName !== undefined && businessName.trim() !== "" ? businessName : undefined) ??
    (request.clientId !== undefined && request.clientId.trim() !== "" ? request.clientId : undefined) ??
    hostOf(request.sources[0]?.url ?? "") ??
    "consulta";

  const slug = slugify(rawCandidate);
  return slug === "" ? "consulta" : slug;
}

/**
 * Gera um runId estável e ordenável cronologicamente: YYYY-MM-DD_HH-mm-ss_<shortHash>
 */
export function runIdOf(sources: { url: string }[], date: Date = new Date()): string {
  const time = formatRunTimestamp(date);
  const fingerprint = shortHash(sources.map((s) => s.url).sort().join("|"));
  return `${time}_${fingerprint}`;
}

export interface DossierPaths {
  entitySlug: string;
  runId: string;
  entityDir: string;
  runDir: string;
  dossierJson: string;
  dossierMarkdown: string;
  manifestJson: string;
  assetsDir: string;
  latestDir: string;
  latestDossierJson: string;
  latestMarkdown: string;
}

/**
 * Resolve todos os caminhos relativos para uma consulta.
 */
export function resolveDossierPaths(entitySlug: string, runId: string): DossierPaths {
  const entityDir = `dossiers/${entitySlug}`;
  const runDir = `${entityDir}/runs/${runId}`;
  const latestDir = `${entityDir}/latest`;

  return {
    entitySlug,
    runId,
    entityDir,
    runDir,
    dossierJson: `${runDir}/dossier.json`,
    dossierMarkdown: `${runDir}/dossie.md`,
    manifestJson: `${runDir}/manifest.json`,
    assetsDir: `${runDir}/assets`,
    latestDir,
    latestDossierJson: `${latestDir}/dossier.json`,
    latestMarkdown: `${latestDir}/dossie.md`,
  };
}

/**
 * Cria o objeto Manifest para uma consulta executada.
 */
export function createManifest(params: {
  dossier: Dossier;
  paths: DossierPaths;
  executedAt?: string;
  durationMs?: number;
}): Manifest {
  const { dossier, paths, executedAt = new Date().toISOString(), durationMs } = params;

  const highConfidenceCount = dossier.confidence.filter((c) => c.level === "high").length;

  return {
    query: dossier.meta.query,
    entitySlug: paths.entitySlug,
    runId: paths.runId,
    executedAt,
    ...(durationMs !== undefined ? { durationMs } : {}),
    status: dossier.meta.status,
    version: dossier.meta.version,
    sources: dossier.sources,
    stats: {
      assetsDownloaded: dossier.assets.length,
      confidenceHighCount: highConfidenceCount,
      missingFieldsCount: dossier.missing.length,
    },
    paths: {
      dossierJson: paths.dossierJson,
      dossierMarkdown: paths.dossierMarkdown,
      assetsDir: paths.assetsDir,
    },
  };
}

/**
 * Atualiza o catálogo geral de dossiês com a nova execução.
 */
export function updateCatalog(
  previousCatalog: Catalog | null | undefined,
  newEntry: CatalogEntry,
): Catalog {
  const currentEntries = previousCatalog?.entries ?? [];
  const existingIndex = currentEntries.findIndex((e) => e.entitySlug === newEntry.entitySlug);

  let updatedEntries: CatalogEntry[];
  if (existingIndex >= 0) {
    const existing = currentEntries[existingIndex]!;
    const mergedEntry: CatalogEntry = {
      ...newEntry,
      runsCount: existing.runsCount + 1,
    };
    updatedEntries = [
      ...currentEntries.slice(0, existingIndex),
      mergedEntry,
      ...currentEntries.slice(existingIndex + 1),
    ];
  } else {
    updatedEntries = [...currentEntries, newEntry];
  }

  // Ordena entradas alfabeticamente pelo nome/slug
  updatedEntries.sort((a, b) => a.entitySlug.localeCompare(b.entitySlug));

  return {
    updatedAt: new Date().toISOString(),
    entries: updatedEntries,
  };
}

/**
 * Gera um README.md amigável para a pasta dossiers/ listando o catálogo atualizado.
 */
export function renderCatalogMarkdown(catalog: Catalog): string {
  const rows = catalog.entries.map((entry) => {
    const statusBadge = entry.status === "complete" ? "🟢 Completo" : entry.status === "partial" ? "🟡 Parcial" : "🔴 Falhou";
    return `| [**\`${entry.entitySlug}\`**](${entry.entitySlug}/latest/dossie.md) | ${entry.name} | ${statusBadge} | v${entry.version} (${entry.runsCount} run${entry.runsCount > 1 ? "s" : ""}) | ${entry.lastExecutedAt.slice(0, 19).replace("T", " ")} |`;
  });

  return `# Catálogo de Dossiês de Clientes

Índice centralizado de todas as pesquisas e consultas a clientes realizadas pelo subagente \`client-dossier\`.

> **Última atualização:** ${catalog.updatedAt.slice(0, 19).replace("T", " ")} UTC  
> **Total de entidades pesquisadas:** ${catalog.entries.length}

---

## Entidades Pesquisadas

| Pasta / Dossiê | Nome Comercial | Status | Versão / Execuções | Última Consulta |
| :--- | :--- | :--- | :--- | :--- |
${rows.length > 0 ? rows.join("\n") : "| *(Nenhum dossiê registrado)* | - | - | - | - |"}

---
*Gerado automaticamente pelo subagente \`client-dossier\`.*
`;
}
