import { defineTool } from "eve/tools";
import { z } from "zod";

import { consolidate, mergeWithPrevious } from "../lib/consolidate";
import { renderMarkdown } from "../lib/markdown";
import {
  dossierSchema,
  errorMessage,
  parseDossierFragment,
  parseDossierRequest,
  type Asset,
  type Dossier,
} from "../lib/schema";
import {
  catalogSchema,
  createManifest,
  entitySlugOf,
  renderCatalogMarkdown,
  resolveDossierPaths,
  runIdOf,
  updateCatalog,
  type Catalog,
} from "../lib/storage";

async function readJson(
  sandbox: { readTextFile: (options: { path: string }) => PromiseLike<string | null> },
  path: string,
): Promise<unknown> {
  try {
    const content = await sandbox.readTextFile({ path });
    return content === null ? undefined : (JSON.parse(content) as unknown);
  } catch {
    return undefined;
  }
}

function previousVersion(previous: unknown): number {
  if (previous === null || typeof previous !== "object") return 0;
  const meta = (previous as Record<string, unknown>)["meta"];
  if (meta === null || typeof meta !== "object") return 0;
  const version = (meta as Record<string, unknown>)["version"];
  return typeof version === "number" && Number.isInteger(version) && version > 0 ? version : 0;
}

/**
 * Consolida, deduplica, valida e emite o dossiê final organizado em pastas por consulta (PRD-organizacao-dossies-pastas).
 * Escreve:
 * - dossiers/<slug>/runs/<runId>/dossier.json
 * - dossiers/<slug>/runs/<runId>/dossie.md
 * - dossiers/<slug>/runs/<runId>/manifest.json
 * - dossiers/<slug>/latest/dossier.json & dossie.md
 * - dossiers/catalog.json & dossiers/README.md
 */
export default defineTool({
  description:
    "Consolida os fragmentos das fontes em um dossiê validado e organizado em pastas por consulta (dossiers/<slug-pesquisado>/runs/<runId>/). " +
    "Aplica deduplicação, resolução de conflitos por prioridade de fonte, provenance por campo, manifesto de execução e índice catalogado. " +
    "Grava dossier.json, dossie.md e manifest.json na subpasta da consulta e devolve o dossiê final consolidado.",
  inputSchema: z.object({
    request: z
      .unknown()
      .describe("DossierRequest (objeto ou JSON) com clientId/name/query e a lista de sources coletadas."),
    fragments: z
      .array(z.unknown())
      .min(1)
      .describe("Fragmentos devolvidos pelas tools de fonte (objeto ou JSON cada um)."),
    version: z.number().int().min(1).optional().describe("Versão do dossiê (padrão: anterior + 1)."),
  }),
  outputSchema: dossierSchema,
  label: { start: (_input) => "Consolidar e organizar dossiê em pasta" },
  async execute({ request, fragments, version }, ctx) {
    let parsedRequest;
    try {
      parsedRequest = parseDossierRequest(request);
    } catch (error) {
      throw new Error(`DossierRequest inválido: ${errorMessage(error)}`);
    }

    const parsedFragments = fragments.map((fragment, index) => {
      try {
        return parseDossierFragment(fragment);
      } catch (error) {
        throw new Error(`Fragmento ${index} inválido: ${errorMessage(error)}`);
      }
    });

    const consolidated = consolidate({
      request: parsedRequest,
      fragments: parsedFragments,
      ...(version === undefined ? {} : { version }),
    });

    const sandbox = await ctx.getSandbox();

    const entitySlug = entitySlugOf(parsedRequest, consolidated.business.name);
    const runId = runIdOf(parsedRequest.sources);
    const paths = resolveDossierPaths(entitySlug, runId);

    // Tenta ler versão anterior da pasta da entidade ou do caminho legado
    let previous = await readJson(sandbox, paths.latestDossierJson);
    if (previous === undefined) {
      previous = await readJson(sandbox, `dossiers/${consolidated.meta.id}/dossier.json`);
    }
    const nextVersion = version ?? previousVersion(previous) + 1;

    let finalConsolidated = consolidated;
    if (previous !== null && typeof previous === "object") {
      try {
        const parsedPrevious = dossierSchema.parse(previous);
        finalConsolidated = mergeWithPrevious(consolidated, parsedPrevious);
      } catch {
        // Mantém consolidated atual se schema anterior for incompatível
      }
    }

    // Copia/organiza assets dentro de dossiers/<slug>/runs/<runId>/assets/<kind>/
    const updatedAssets: Asset[] = [];
    for (const asset of finalConsolidated.assets) {
      if (asset.localPath !== undefined && asset.localPath.trim() !== "") {
        let fileName = `${asset.id ?? asset.kind}`;
        if (asset.format !== undefined) {
          fileName += `.${asset.format === "svg+xml" ? "svg" : asset.format}`;
        } else {
          fileName += ".bin";
        }

        const runAssetRelative = `${paths.assetsDir}/${asset.kind}/${fileName}`;

        // Se o asset já não estiver no caminho da run, espelha se possível
        try {
          const content = await sandbox.readBinaryFile({ path: asset.localPath });
          if (content !== null) {
            await sandbox.writeBinaryFile({ path: runAssetRelative, content });
            updatedAssets.push({
              ...asset,
              localPath: sandbox.resolvePath(runAssetRelative),
            });
            continue;
          }
        } catch {
          // Mantém asset com o caminho existente se não for possível ler o binário
        }
      }
      updatedAssets.push(asset);
    }

    const businessName =
      finalConsolidated.business.name ??
      parsedRequest.name ??
      parsedRequest.clientId ??
      entitySlug;

    const dossier: Dossier = {
      ...finalConsolidated,
      meta: {
        ...finalConsolidated.meta,
        id: `${entitySlug}-${runId}`,
        name: businessName,
        query: parsedRequest.query ?? parsedRequest.name,
        entitySlug,
        runId,
        version: nextVersion,
        dossierPath: sandbox.resolvePath(paths.dossierJson),
        markdownPath: sandbox.resolvePath(paths.dossierMarkdown),
        manifestPath: sandbox.resolvePath(paths.manifestJson),
      },
      assets: updatedAssets,
    };

    const renderedMd = renderMarkdown(dossier);
    const jsonContent = `${JSON.stringify(dossier, null, 2)}\n`;

    // 1. Grava na pasta específica da consulta (runs/YYYY-MM-DD_HH-mm-ss_<hash>/)
    await sandbox.writeTextFile({ path: paths.dossierMarkdown, content: renderedMd });
    await sandbox.writeTextFile({ path: paths.dossierJson, content: jsonContent });

    // 2. Grava o manifest.json da consulta
    const manifest = createManifest({ dossier, paths });
    await sandbox.writeTextFile({
      path: paths.manifestJson,
      content: `${JSON.stringify(manifest, null, 2)}\n`,
    });

    // 3. Atualiza o ponteiro / cópia em latest/
    await sandbox.writeTextFile({ path: paths.latestMarkdown, content: renderedMd });
    await sandbox.writeTextFile({ path: paths.latestDossierJson, content: jsonContent });

    // 4. Grava também no caminho legado para manter total compatibilidade retroativa
    const legacyJsonRelative = `dossiers/${consolidated.meta.id}/dossier.json`;
    const legacyMarkdownRelative = `dossiers/${consolidated.meta.id}/dossie.md`;
    await sandbox.writeTextFile({ path: legacyMarkdownRelative, content: renderedMd });
    await sandbox.writeTextFile({ path: legacyJsonRelative, content: jsonContent });

    // 5. Atualiza a raiz do workspace para visualização rápida no editor
    await sandbox.writeTextFile({ path: "dossie.md", content: renderedMd });
    await sandbox.writeTextFile({ path: "dossier.json", content: jsonContent });

    // 6. Atualiza o catálogo global dossiers/catalog.json e dossiers/README.md
    try {
      const rawCatalog = await readJson(sandbox, "dossiers/catalog.json");
      let currentCatalog: Catalog | null = null;
      if (rawCatalog !== undefined) {
        try {
          currentCatalog = catalogSchema.parse(rawCatalog);
        } catch {
          currentCatalog = null;
        }
      }

      const updatedCat = updateCatalog(currentCatalog, {
        entitySlug,
        name: businessName,
        lastRunId: runId,
        lastExecutedAt: manifest.executedAt,
        status: dossier.meta.status,
        version: nextVersion,
        latestDossierJson: paths.latestDossierJson,
        latestMarkdown: paths.latestMarkdown,
        runsCount: 1,
      });

      await sandbox.writeTextFile({
        path: "dossiers/catalog.json",
        content: `${JSON.stringify(updatedCat, null, 2)}\n`,
      });

      await sandbox.writeTextFile({
        path: "dossiers/README.md",
        content: renderCatalogMarkdown(updatedCat),
      });
    } catch {
      // Falha ao atualizar catálogo não impede a conclusão do dossiê
    }

    return dossierSchema.parse(dossier);
  },
});
