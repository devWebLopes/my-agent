/**
 * Executor de Coleta de Dados do Dossiê do Cliente (`client-dossier`)
 *
 * Permite rodar uma coleta de dados completa a partir da linha de comando,
 * integrando fontes de PJ (CNPJ), Website, Redes Sociais e Google Maps.
 *
 * Uso:
 * ```sh
 * node scripts/run-client-dossier.mts --cnpj 00000000000191 --website https://example.com
 * ```
 * Se nenhum argumento for passado, executa uma demonstração com dados reais de teste.
 */

import { registerHooks } from "node:module";
import fs from "node:fs/promises";
import path from "node:path";

// Resolver ESM sem extensão para arquivos .ts
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // fallback
      }
    }
    return nextResolve(specifier, context);
  },
});

const LIB = "../agent/subagents/client-dossier/lib";
const TOOLS = "../agent/subagents/client-dossier/tools";

const { consolidate } = await import(`${LIB}/consolidate.ts`);
const { renderMarkdown } = await import(`${LIB}/markdown.ts`);
const { parseDossierRequest, dossierSchema } = await import(`${LIB}/schema.ts`);
const { detectSourceType, normalizeUrl, cleanCnpj, formatCnpj } = await import(`${LIB}/url.ts`);

// Tools
const cnpjLookupTool = (await import(`${TOOLS}/cnpj_lookup.ts`)).default;
const fetchUrlTool = (await import(`${TOOLS}/fetch_url.ts`)).default;
const extractVisualTool = (await import(`${TOOLS}/extract_visual_identity.ts`)).default;
const scrapePageTool = (await import(`${TOOLS}/scrape_page.ts`)).default;
const socialProfileTool = (await import(`${TOOLS}/social_profile.ts`)).default;

function parseArgs() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--") && i + 1 < args.length) {
      const key = arg.slice(2);
      options[key] = args[++i];
    }
  }
  return options;
}

async function main() {
  const options = parseArgs();

  // Se nenhum argumento for passado, usa um exemplo corporativo público real (ex: Banco do Brasil ou Petrobras ou exemplo configurável)
  // CNPJ 00.000.000/0001-91 é o Banco do Brasil (dados 100% públicos e estáveis na Receita)
  const cnpj = options.cnpj ?? "00.000.000/0001-91";
  const website = options.website ?? "https://example.com";
  const name = options.name;
  const clientId = options.clientId ?? "cliente-demo";

  console.log("=================================================================");
  console.log("   Módulo de Coleta e Análise de Dados (client-dossier)         ");
  console.log("=================================================================\n");
  console.log(`Iniciando coleta para: ${clientId}`);
  if (cnpj) console.log(`- CNPJ: ${cnpj}`);
  if (website) console.log(`- Website: ${website}`);
  console.log("");

  const sourcesList: Array<{ type: any; url: string }> = [];
  if (cnpj) sourcesList.push({ type: "cnpj", url: `cnpj:${cleanCnpj(cnpj)}` });
  if (website) sourcesList.push({ type: "website", url: normalizeUrl(website) });

  const dossierRequest = parseDossierRequest({
    clientId,
    name,
    sources: sourcesList,
  });

  const fragments: any[] = [];

  // 1. Coleta CNPJ
  if (cnpj) {
    console.log(`[1/3] Consultando base cadastral PJ (CNPJ: ${formatCnpj(cleanCnpj(cnpj))})...`);
    try {
      const result = await cnpjLookupTool.execute({ cnpj });
      if (result.ok && result.fragment) {
        fragments.push(result.fragment);
        console.log(`  ✓ Razão Social: ${result.legalName}`);
        if (result.tradeName) console.log(`  ✓ Nome Fantasia: ${result.tradeName}`);
        console.log(`  ✓ Situação: ${result.status}`);
        if (result.cnae) console.log(`  ✓ CNAE: ${result.cnae}`);
        if (result.qsa?.length) console.log(`  ✓ Sócios (QSA): ${result.qsa.length} sócio(s) identificado(s)`);
      } else {
        console.log(`  ⚠ Falha ao consultar CNPJ: ${result.reason}`);
        if (result.fragment) fragments.push(result.fragment);
      }
    } catch (err: any) {
      console.log(`  ✗ Erro inesperado na tool cnpj_lookup: ${err.message}`);
    }
  }

  // 2. Coleta Website & Identidade Visual
  if (website) {
    console.log(`\n[2/3] Coletando Website & Identidade Visual (${website})...`);
    try {
      const fetchRes = await fetchUrlTool.execute({ url: website });
      if (fetchRes.ok) {
        console.log(`  ✓ Página carregada: HTTP ${fetchRes.status} (${fetchRes.title ?? "Sem título"})`);
      }

      const visualRes = await extractVisualTool.execute({ url: website });
      if (visualRes.ok) {
        console.log(`  ✓ Cores identificadas: ${visualRes.colors?.length ?? 0} cor(es)`);
        console.log(`  ✓ Tipografia: ${visualRes.typography?.length ?? 0} família(s)`);
        if (visualRes.logo) console.log(`  ✓ Logo: ${visualRes.logo.url}`);
      }

      const scrapeRes = await scrapePageTool.execute({ url: website });
      if (scrapeRes.ok) {
        console.log(`  ✓ Conteúdo extraído: ${scrapeRes.sections?.length ?? 0} seções (${scrapeRes.textLength ?? 0} caracteres)`);
      }

      let webName = fetchRes.title;
      let webDesc = fetchRes.description;
      const contacts = scrapeRes.ok ? { emails: scrapeRes.emails, phones: scrapeRes.phones } : undefined;

      const webBusiness: Record<string, any> = {
        website: { value: fetchRes.finalUrl ?? normalizeUrl(website), source: website, confidence: "high" },
      };
      if (webName) webBusiness.name = { value: webName, source: website, confidence: "medium" };
      if (webDesc) webBusiness.description = { value: webDesc, source: website, confidence: "high" };
      if (contacts?.phones?.[0]) webBusiness.phone = { value: contacts.phones[0], source: website, confidence: "high" };
      if (contacts?.emails?.[0]) webBusiness.email = { value: contacts.emails[0], source: website, confidence: "high" };

      const webFragment = {
        source: {
          type: "website" as const,
          url: normalizeUrl(website),
          fetchedAt: new Date().toISOString(),
          status: fetchRes.ok ? ("ok" as const) : ("partial" as const),
          ...(fetchRes.title ? { title: fetchRes.title } : {}),
          ...(fetchRes.finalUrl ? { finalUrl: fetchRes.finalUrl } : {}),
        },
        business: webBusiness,
        visualIdentity: {
          colors: visualRes.colors ?? [],
          typography: visualRes.typography ?? [],
          ...(visualRes.logo ? { logo: visualRes.logo } : {}),
          ...(visualRes.favicon ? { favicon: visualRes.favicon } : {}),
        },
        missing: visualRes.missing ?? [],
      };

      fragments.push(webFragment);
    } catch (err: any) {
      console.log(`  ✗ Erro na coleta do website: ${err.message}`);
    }
  }

  // 3. Consolidação com Provenance
  console.log(`\n[3/3] Consolidando dossiê com deduplicação e provenance...`);
  const dossier = consolidate({
    request: dossierRequest,
    fragments,
  });

  const parsed = dossierSchema.safeParse(dossier);
  if (!parsed.success) {
    console.error("Erro na validação do schema do dossiê:", parsed.error);
  } else {
    console.log("  ✓ Dossiê validado com sucesso contra o Schema Zod (RNF-06).");
  }

  // Gravar arquivos locais
  const dossierJsonPath = path.resolve("dossier.json");
  const dossierMdPath = path.resolve("dossie.md");

  dossier.meta.markdownPath = dossierMdPath;
  dossier.meta.dossierPath = dossierJsonPath;

  await fs.writeFile(dossierJsonPath, JSON.stringify(dossier, null, 2), "utf-8");
  await fs.writeFile(dossierMdPath, renderMarkdown(dossier), "utf-8");

  console.log("\n=================================================================");
  console.log("   Resultado da Coleta de Dados                                 ");
  console.log("=================================================================");
  console.log(`Status do Dossiê:    ${dossier.meta.status.toUpperCase()}`);
  console.log(`Fontes Processadas:  ${dossier.meta.sourcesCount}`);
  console.log(`Campos com Confiança:${dossier.confidence.length}`);
  console.log(`Campos Ausentes:     ${dossier.missing.length}`);
  console.log(`\nArquivos gerados:`);
  console.log(`- ${dossierJsonPath}`);
  console.log(`- ${dossierMdPath}`);
  console.log("=================================================================\n");
}

main().catch((err) => {
  console.error("Erro fatal na execução da coleta:", err);
  process.exit(1);
});
