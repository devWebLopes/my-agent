/**
 * Verificação offline do núcleo determinístico do `client-dossier`
 * (parsing de HTML, identidade visual, social, consolidação e markdown).
 *
 * Não usa rede nem modelo. Roda com o type-stripping do Node 24:
 *
 * ```sh
 * node scripts/check-dossier-lib.mts
 * ```
 */
import assert from "node:assert/strict";
import { registerHooks } from "node:module";

// O código do agente usa imports ESM sem extensão (resolução "bundler" do tsc/eve);
// este hook os resolve para os arquivos .ts, permitindo rodar a lógica pura no Node.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && !/\.[cm]?[jt]s$/i.test(specifier)) {
      try {
        return nextResolve(`${specifier}.ts`, context);
      } catch {
        // cai para a resolução padrão
      }
    }
    return nextResolve(specifier, context);
  },
});

const LIB = "../agent/subagents/client-dossier/lib";

const { visibleText, cleanContent, metaTags, jsonLdBlocks, jsonLdNodes, titleOf, headings, contactLinks, sectionsOf, looksJsDriven } =
  await import(`${LIB}/html.ts`);
const { normalizeUrl, detectSourceType, slugify, resolveUrl, cleanCnpj, isValidCnpj, formatCnpj } = await import(`${LIB}/url.ts`);
const { extractVisualIdentity, normalizeHex, luminance, colorFrequency, typographyFor, cssVariables } =
  await import(`${LIB}/visual-identity.ts`);
const {
  parseCompactNumber,
  followersFromText,
  handleOf,
  platformOf,
  socialLinksFromHtml,
  extractSocialProfile,
  toSocialFragment,
} = await import(`${LIB}/social.ts`);
const { consolidate, dossierIdOf } = await import(`${LIB}/consolidate.ts`);
const { renderMarkdown } = await import(`${LIB}/markdown.ts`);
const {
  entitySlugOf,
  runIdOf,
  resolveDossierPaths,
  createManifest,
  manifestSchema,
  updateCatalog,
  catalogSchema,
  renderCatalogMarkdown,
} = await import(`${LIB}/storage.ts`);
const { dossierSchema, parseDossierRequest, parseDossierFragment, errorMessage } = await import(
  `${LIB}/schema.ts`
);

let checks = 0;

function check(name: string, fn: () => void): void {
  fn();
  checks += 1;
  process.stdout.write(`ok   ${name}\n`);
}

const HTML = `<!doctype html>
<html lang="pt-BR">
  <head>
    <title>Café Aurora — Cafeteria artesanal</title>
    <meta name="description" content="Cafeteria artesanal em Curitiba" />
    <meta property="og:image" content="/img/og.png" />
    <meta name="theme-color" content="#8a4b1f" />
    <link rel="icon" href="/favicon.svg" />
    <link rel="stylesheet" href="/styles.css" />
    <script type="application/ld+json">
      {"@type":"CafeOrCoffeeShop","name":"Café Aurora","description":"Cafeteria artesanal em Curitiba","telephone":"+55 41 3333-4444","logo":"/brand/logo.png","sameAs":["https://www.instagram.com/cafeaurora"]}
    </script>
    <style>
      :root { --color-primary: #8a4b1f; --color-background: #fdfaf6; --font-heading: "Playfair Display", serif; --font-body: "Inter", sans-serif; }
      body { font-family: Inter, sans-serif; color: #221a14; background-color: #fdfaf6; }
      h1, h2 { font-family: "Playfair Display", serif; }
    </style>
  </head>
  <body>
    <h1>Café Aurora</h1>
    <p>Torrefação artesanal e cafés especiais no centro de Curitiba.</p>
    <a href="mailto:contato@cafeaurora.com.br">contato@cafeaurora.com.br</a>
    <a href="tel:+554133334444">+55 41 3333-4444</a>
    <a href="https://www.instagram.com/cafeaurora">Instagram</a>
    <a href="https://linktr.ee/cafeaurora">Linktree</a>
  </body>
</html>`;

const PLAIN_HTML = `<!doctype html><html><head><title>Exemplo</title></head><body><h1>Exemplo</h1><p>Página mínima.</p><div id="root"></div></body></html>`;

const JS_HTML = `<!doctype html><html><head><title>App</title></head><body><div id="root"></div>
${Array.from({ length: 10 }, (_value, index) => `<script src="/chunk-${index}.js"></script>`).join("\n")}
</body></html>`;


process.stdout.write("\n== parsing de HTML ==\n");

check("html: texto visível, título, meta tags e JSON-LD", () => {
  assert.equal(visibleText("<p>Olá <b>mundo</b></p>").includes("Olá mundo"), true);
  assert.equal(titleOf(HTML), "Café Aurora — Cafeteria artesanal");
  const meta = metaTags(HTML);
  assert.equal(meta["theme-color"], "#8a4b1f");
  assert.equal(meta["og:image"], "/img/og.png");
  assert.equal(jsonLdBlocks(HTML).length, 1);
  assert.equal(typeof jsonLdNodes(jsonLdBlocks(HTML))[0]?.["name"], "string");
});

check("html: contatos, cabeçalhos, seções e sinal de JS", () => {
  const contacts = contactLinks(HTML);
  assert.deepEqual(contacts.emails, ["contato@cafeaurora.com.br"]);
  assert.deepEqual(contacts.phones, ["+554133334444"]);
  assert.equal(headings(HTML)[0]?.text, "Café Aurora");
  assert.equal(sectionsOf(HTML).length >= 1, true);
  assert.equal(looksJsDriven("<html><body><h1>Oi</h1><p>Tudo bem por aqui.</p></body></html>"), false);
  assert.equal(looksJsDriven(JS_HTML), true);
});

process.stdout.write("\n== URLs ==\n");

check("url: normalização, classificação e slug", () => {
  assert.equal(normalizeUrl("Example.com/path#top"), "https://example.com/path");
  assert.equal(detectSourceType("https://www.google.com/maps/place/Restaurante"), "google_maps");
  assert.equal(detectSourceType("https://instagram.com/loja"), "instagram");
  assert.equal(detectSourceType("https://www.youtube.com/@loja"), "youtube");
  assert.equal(detectSourceType("https://cafeaurora.com.br"), "website");
  assert.equal(resolveUrl("https://x.com/a/b", "/logo.png"), "https://x.com/logo.png");
  assert.equal(slugify("Café Aurora Ltda."), "cafe-aurora-ltda");
  assert.throws(() => normalizeUrl("ftp://example.com/x"), /Unsupported URL scheme/);
});

process.stdout.write("\n== identidade visual ==\n");

check("visual: cores, tipografia, logo e favicon com fonte", () => {
  const result = extractVisualIdentity({ html: HTML, css: "", baseUrl: "https://cafeaurora.com.br/" });
  const color = (role) => result.colors.find((entry) => entry.role === role);
  assert.equal(color("primary")?.hex, "#8a4b1f");
  assert.match(String(color("primary")?.source), /css-var|theme-color/);
  assert.equal(color("background")?.hex, "#fdfaf6");
  assert.equal(color("text")?.hex, "#221a14");
  assert.equal(result.typography.find((entry) => entry.role === "heading")?.family, "Playfair Display");
  assert.equal(result.typography.find((entry) => entry.role === "body")?.family, "Inter");
  assert.equal(result.logo?.url, "https://cafeaurora.com.br/brand/logo.png");
  assert.equal(result.favicon?.url, "https://cafeaurora.com.br/favicon.svg");
  assert.deepEqual(result.missing, []);
});

check("visual: site sem logo sinaliza missing sem inventar", () => {
  const result = extractVisualIdentity({ html: PLAIN_HTML, css: "", baseUrl: "https://example.com/" });
  const fields = result.missing.map((item) => item.field);
  assert.equal(result.logo, undefined);
  assert.equal(result.favicon, undefined);
  assert.equal(fields.includes("visualIdentity.logo"), true);
  assert.equal(fields.includes("visualIdentity.favicon"), true);
});

check("visual: helpers de cor e tipografia", () => {
  assert.equal(normalizeHex("#ABC"), "#aabbcc");
  assert.equal(normalizeHex("rgba(255, 255, 255, 0)"), undefined);
  assert.equal(luminance("#ffffff") > 0.9, true);
  assert.equal(colorFrequency("a{color:#000}b{color:#000}c{color:#fff}")[0]?.hex, "#000000");
  assert.equal(cssVariables(":root{--x: 1px;}").get("--x"), "1px");
  assert.equal(typographyFor("h1{font-family:'Foo',serif}", new Map())[0]?.family, "Foo");
});

process.stdout.write("\n== redes sociais ==\n");

check("social: plataforma, handle e números compactos", () => {
  assert.equal(platformOf("https://www.instagram.com/cafeaurora/"), "instagram");
  assert.equal(handleOf("https://www.instagram.com/cafeaurora/"), "cafeaurora");
  assert.equal(handleOf("https://www.tiktok.com/@cafeaurora"), "cafeaurora");
  assert.equal(handleOf("https://www.linkedin.com/company/cafe-aurora/"), "cafe-aurora");
  assert.equal(handleOf("https://www.youtube.com/@cafeaurora"), "cafeaurora");
  assert.equal(parseCompactNumber("1,2 mil"), 1200);
  assert.equal(parseCompactNumber("12.4K"), 12400);
  assert.equal(parseCompactNumber("3,1M"), 3100000);
  assert.equal(followersFromText("Cafeteria • 1,2 mil seguidores"), 1200);
});

check("social: perfil e fragmento", () => {
  const profile = extractSocialProfile({
    url: "https://www.instagram.com/cafeaurora/",
    html:
      '<html><head><meta property="og:title" content="Café Aurora" />' +
      '<meta property="og:description" content="Cafeteria artesanal em Curitiba. 1,2 mil seguidores." /></head>' +
      '<body><a href="https://linktr.ee/cafeaurora">link</a></body></html>',
  });
  assert.equal(profile.handle, "cafeaurora");
  assert.equal(profile.followers, 1200);
  assert.equal(profile.bio, "Cafeteria artesanal em Curitiba. 1,2 mil seguidores.");
  assert.equal(profile.links?.includes("https://linktr.ee/cafeaurora"), true);
  assert.equal(profile.confidence, "high");
  const fragment = toSocialFragment(profile);
  assert.equal(fragment.platform, "instagram");
  assert.equal(fragment.source, "https://www.instagram.com/cafeaurora/");
});

check("social: links descobertos no site", () => {
  assert.deepEqual(socialLinksFromHtml(HTML, "https://cafeaurora.com.br/"), [
    "https://www.instagram.com/cafeaurora",
  ]);
});

process.stdout.write("\n== schema e consolidação ==\n");

check("schema: request e fragmento aceitam JSON serializado", () => {
  const request = parseDossierRequest(
    '{"clientId":"cafe-aurora","sources":[{"type":"website","url":"https://cafeaurora.com.br"}]}',
  );
  assert.equal(request.sources.length, 1);
  const fragment = parseDossierFragment(
    JSON.stringify({
      source: {
        type: "website",
        url: "https://cafeaurora.com.br",
        fetchedAt: "2026-01-01T00:00:00.000Z",
        status: "ok",
      },
      business: {
        name: { value: "Café Aurora", source: "https://cafeaurora.com.br", confidence: "high" },
      },
    }),
  );
  assert.equal(fragment.business?.name?.value, "Café Aurora");
  assert.throws(() => parseDossierRequest('{"sources":[]}'), /sources/);
  assert.match(errorMessage(new Error("boom")), /boom/);
});

const AT = "2026-01-01T12:00:00.000Z";
const WEBSITE_FRAGMENT = {
  source: {
    type: "website",
    url: "https://cafeaurora.com.br",
    fetchedAt: AT,
    status: "ok",
    title: "Café Aurora",
  },
  business: {
    name: { value: "Café Aurora", source: "https://cafeaurora.com.br", confidence: "high" },
    description: {
      value: "Torrefação artesanal no centro de Curitiba.",
      source: "https://cafeaurora.com.br",
      confidence: "high",
    },
    phone: { value: "+55 41 3333-4444", source: "https://cafeaurora.com.br", confidence: "medium" },
  },
  visualIdentity: {
    colors: [{ role: "primary", hex: "#8a4b1f", source: "website:css-var(--color-primary)" }],
    typography: [{ role: "body", family: "Inter", source: "website:css-var(--font-body)" }],
    logo: { url: "https://cafeaurora.com.br/brand/logo.png", source: "website:json-ld(logo)" },
    favicon: { url: "https://cafeaurora.com.br/favicon.svg", source: "website:link[rel=icon]" },
  },
  assets: [
    {
      id: "logo-abc123",
      kind: "logo",
      url: "https://cafeaurora.com.br/brand/logo.png",
      localPath: "/workspace/assets/logo/abc123.png",
      source: "https://cafeaurora.com.br",
    },
  ],
};

const MAPS_FRAGMENT = {
  source: {
    type: "google_maps",
    url: "https://www.google.com/maps/place/Cafe+Aurora",
    fetchedAt: AT,
    status: "ok",
  },
  business: {
    name: { value: "Cafe Aurora", source: "google_places:xyz", confidence: "high" },
    phone: { value: "+55 41 99999-0000", source: "google_places:xyz", confidence: "high" },
  },
  maps: {
    placeId: { value: "xyz", source: "google_places:xyz", confidence: "high" },
    rating: { value: 4.8, source: "google_places:xyz", confidence: "high" },
    reviewCount: { value: 312, source: "google_places:xyz", confidence: "high" },
  },
};

const SOCIAL_FRAGMENT = {
  source: {
    type: "instagram",
    url: "https://www.instagram.com/cafeaurora",
    fetchedAt: AT,
    status: "ok",
  },
  social: [
    {
      platform: "instagram",
      url: "https://www.instagram.com/cafeaurora",
      handle: "cafeaurora",
      followers: 1200,
      source: "https://www.instagram.com/cafeaurora",
      confidence: "high",
    },
  ],
};

check("consolidação: prioridade, provenance, dedupe e status", () => {
  const request = parseDossierRequest({
    clientId: "cafe-aurora",
    sources: [
      { type: "website", url: "https://cafeaurora.com.br" },
      { type: "google_maps", url: "https://www.google.com/maps/place/Cafe+Aurora" },
      { type: "instagram", url: "https://www.instagram.com/cafeaurora" },
    ],
  });

  const dossier = consolidate({
    request,
    fragments: [WEBSITE_FRAGMENT, MAPS_FRAGMENT, SOCIAL_FRAGMENT, SOCIAL_FRAGMENT],
    createdAt: AT,
    version: 1,
  });

  // Prioridade de fonte: site vence o Google Maps no conflito de nome.
  assert.equal(dossier.business.name, "Café Aurora");
  assert.equal(dossier.business.contact.phone, "+55 41 3333-4444");
  assert.equal(dossier.maps?.rating, 4.8);
  assert.equal(dossier.social.length, 1); // deduplicado por plataforma:handle
  assert.equal(dossier.social[0]?.handle, "cafeaurora");
  assert.equal(dossier.assets[0]?.localPath, "/workspace/assets/logo/abc123.png");
  assert.equal(dossier.meta.status, "complete");
  assert.equal(dossier.meta.sourcesCount, 4);

  const nameRecord = dossier.confidence.find((record) => record.field === "business.name");
  assert.equal(nameRecord?.source, "https://cafeaurora.com.br");
  assert.match(String(nameRecord?.note), /conflito/);
  assert.equal(dossier.missing.some((item) => item.field === "business.contact.email"), true);
  assert.equal(dossier.visualIdentity.colors[0]?.hex, "#8a4b1f");
  assert.equal(dossier.confidence.some((record) => record.field === "visualIdentity.logo"), true);
  assert.equal(dossierSchema.safeParse(dossier).success, true);
  assert.equal(dossierIdOf(request).startsWith("cafe-aurora-"), true);
});

check("consolidação: fonte quebrada gera partial + missing", () => {
  const request = parseDossierRequest({
    clientId: "cafe-aurora",
    sources: [{ type: "website", url: "https://cafeaurora.com.br" }],
  });
  const dossier = consolidate({
    request,
    fragments: [
      {
        ...WEBSITE_FRAGMENT,
        source: { ...WEBSITE_FRAGMENT.source, status: "failed", reason: "HTTP 404" },
        business: {},
        visualIdentity: {},
        assets: [],
        missing: [{ field: "business.name", reason: "HTTP 404" }],
      },
    ],
  });
  assert.equal(dossier.meta.status, "partial");
  assert.equal(dossier.sources[0]?.status, "failed");
  assert.equal(dossier.missing.some((item) => item.reason === "HTTP 404"), true);
  assert.equal(dossier.visualIdentity.colors.length, 0);
  assert.equal(dossierSchema.safeParse(dossier).success, true);
});

check("markdown: renderiza o dossiê com provenance", () => {
  const request = parseDossierRequest({
    clientId: "cafe-aurora",
    sources: [{ type: "website", url: "https://cafeaurora.com.br" }],
  });
  const dossier = consolidate({ request, fragments: [WEBSITE_FRAGMENT, MAPS_FRAGMENT] });
  const markdown = renderMarkdown(dossier);
  assert.match(markdown, /# Dossiê — Café Aurora/);
  assert.match(markdown, /## Identidade visual/);
  assert.match(markdown, /## Provenance \(confiança por campo\)/);
  assert.match(markdown, /## Campos ausentes/);
  assert.match(markdown, /#8a4b1f/);
  assert.match(markdown, /Google Maps/);
});

check("markdown: renderiza o caminho completo de onde o dossiê foi salvo ao final", () => {
  const request = parseDossierRequest({
    clientId: "cafe-aurora",
    sources: [{ type: "website", url: "https://cafeaurora.com.br" }],
  });
  const dossier = consolidate({ request, fragments: [WEBSITE_FRAGMENT] });
  dossier.meta.markdownPath = "/workspace/dossiers/cafe-aurora/runs/2026-09-18_10-00-00_123456/dossie.md";
  dossier.meta.dossierPath = "/workspace/dossiers/cafe-aurora/runs/2026-09-18_10-00-00_123456/dossier.json";
  dossier.meta.manifestPath = "/workspace/dossiers/cafe-aurora/runs/2026-09-18_10-00-00_123456/manifest.json";

  const markdown = renderMarkdown(dossier);
  assert.match(markdown, /### Local de Armazenamento/);
  assert.match(markdown, /Caminho completo \(Markdown\):\*\* `\/workspace\/dossiers\/cafe-aurora\/runs\/2026-09-18_10-00-00_123456\/dossie\.md`/);
  assert.match(markdown, /Caminho completo \(JSON\):\*\* `\/workspace\/dossiers\/cafe-aurora\/runs\/2026-09-18_10-00-00_123456\/dossier\.json`/);
  assert.match(markdown, /Manifesto de execução:\*\* `\/workspace\/dossiers\/cafe-aurora\/runs\/2026-09-18_10-00-00_123456\/manifest\.json`/);

  const mdWithOptions = renderMarkdown(consolidate({ request, fragments: [WEBSITE_FRAGMENT] }), {
    markdownPath: "/workspace/custom/dossie.md",
  });
  assert.match(mdWithOptions, /Caminho completo \(Markdown\):\*\* `\/workspace\/custom\/dossie\.md`/);
});

check("html: cleanContent remove boilerplate e ruídos", () => {
  const dirtyHtml = `
    <!doctype html>
    <html>
      <head><title>Teste</title></head>
      <body>
        <nav><a href="/">Início</a><a href="/contato">Contato</a></nav>
        <header><h1>Header do Site</h1></header>
        <main>
          <p>Este é o conteúdo principal institucional da empresa de serviços.</p>
        </main>
        <aside><p>Anúncios laterais e widgets</p></aside>
        <div class="cookie-banner"><p>Aceite nossos cookies</p></div>
        <footer><p>Copyright 2026. Todos os direitos reservados.</p></footer>
      </body>
    </html>
  `;
  const cleaned = cleanContent(dirtyHtml);
  assert.match(cleaned, /conteúdo principal institucional/);
  assert.equal(cleaned.includes("Header do Site"), false);
  assert.equal(cleaned.includes("Início"), false);
  assert.equal(cleaned.includes("Anúncios laterais"), false);
  assert.equal(cleaned.includes("Aceite nossos cookies"), false);
  assert.equal(cleaned.includes("Copyright 2026"), false);
});

check("url: validação, normalização e formatação de CNPJ", () => {
  // CNPJ fictício válido no algoritmo módulo 11: 00.000.000/0001-91
  assert.equal(isValidCnpj("00.000.000/0001-91"), true);
  assert.equal(isValidCnpj("00000000000191"), true);
  assert.equal(isValidCnpj("11.111.111/1111-11"), false); // todos dígitos iguais
  assert.equal(isValidCnpj("12345"), false);

  assert.equal(formatCnpj("00000000000191"), "00.000.000/0001-91");
  assert.equal(normalizeUrl("00.000.000/0001-91"), "cnpj:00000000000191");
  assert.equal(detectSourceType("00.000.000/0001-91"), "cnpj");
  assert.equal(detectSourceType("cnpj:00000000000191"), "cnpj");
});

check("consolidação: dados cadastrais PJ/CNPJ integrados com prioridade máxima e provenance", () => {
  const request = parseDossierRequest({
    clientId: "acme-corp",
    sources: [
      { type: "cnpj", url: "cnpj:00000000000191" },
      { type: "website", url: "https://acme.com.br" },
    ],
  });

  const cnpjFragment = {
    source: {
      type: "cnpj" as const,
      url: "cnpj:00000000000191",
      fetchedAt: "2026-09-15T00:00:00Z",
      status: "ok" as const,
      title: "ACME Comércio e Serviços LTDA",
    },
    business: {
      name: { value: "ACME Corp", source: "cnpj:00000000000191", confidence: "high" as const },
      legalName: { value: "ACME Comércio e Serviços LTDA", source: "cnpj:00000000000191", confidence: "high" as const },
      cnpj: { value: "00.000.000/0001-91", source: "cnpj:00000000000191", confidence: "high" as const },
      status: { value: "ATIVA", source: "cnpj:00000000000191", confidence: "high" as const },
      cnae: { value: "Desenvolvimento de programas de computador", source: "cnpj:00000000000191", confidence: "high" as const },
      qsa: { value: ["Maria Silva (Sócio-Administrador)", "João Santos (Sócio)"], source: "cnpj:00000000000191", confidence: "high" as const },
    },
  };

  const webFragment = {
    ...WEBSITE_FRAGMENT,
    business: {
      // O site tenta sobrescrever a razão social, mas CNPJ deve prevalecer por prioridade (5 > 4)
      legalName: { value: "ACME do Brasil", source: "https://acme.com.br", confidence: "medium" as const },
      description: { value: "Líder em tecnologia", source: "https://acme.com.br", confidence: "high" as const },
    },
  };

  const dossier = consolidate({ request, fragments: [cnpjFragment, webFragment] });

  assert.equal(dossier.business.legalName, "ACME Comércio e Serviços LTDA");
  assert.equal(dossier.business.cnpj, "00.000.000/0001-91");
  assert.equal(dossier.business.status, "ATIVA");
  assert.equal(dossier.business.cnae, "Desenvolvimento de programas de computador");
  assert.equal(dossier.business.qsa?.length, 2);

  // Markdown exibe a tabela de negócio com dados corporativos
  const md = renderMarkdown(dossier);
  assert.match(md, /00\.000\.000\/0001-91/);
  assert.match(md, /ACME Comércio e Serviços LTDA/);
  assert.match(md, /ATIVA/);
  assert.match(md, /Maria Silva/);

  // Validação do schema final
  assert.equal(dossierSchema.safeParse(dossier).success, true);
});

check("storage: entitySlug, runId, caminhos estruturados e validação de manifesto", () => {
  const request = parseDossierRequest({
    name: "Café & Bistrô Aurora (Curitiba)!",
    query: "Pesquisa Café Aurora",
    sources: [
      { type: "website", url: "https://cafeaurora.com.br" },
      { type: "instagram", url: "https://instagram.com/cafeaurora" },
    ],
  });

  const slug = entitySlugOf(request, "Café Aurora");
  assert.equal(slug, "cafe-e-bistro-aurora-curitiba");

  const fixedDate = new Date("2026-09-18T10:30:00Z");
  const runId = runIdOf(request.sources, fixedDate);
  assert.match(runId, /^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_[a-f0-9]{6}$/);

  const paths = resolveDossierPaths(slug, runId);
  assert.equal(paths.entityDir, "dossiers/cafe-e-bistro-aurora-curitiba");
  assert.equal(paths.runDir, `dossiers/cafe-e-bistro-aurora-curitiba/runs/${runId}`);
  assert.equal(paths.dossierJson, `dossiers/cafe-e-bistro-aurora-curitiba/runs/${runId}/dossier.json`);
  assert.equal(paths.dossierMarkdown, `dossiers/cafe-e-bistro-aurora-curitiba/runs/${runId}/dossie.md`);
  assert.equal(paths.manifestJson, `dossiers/cafe-e-bistro-aurora-curitiba/runs/${runId}/manifest.json`);
  assert.equal(paths.assetsDir, `dossiers/cafe-e-bistro-aurora-curitiba/runs/${runId}/assets`);
  assert.equal(paths.latestDossierJson, "dossiers/cafe-e-bistro-aurora-curitiba/latest/dossier.json");

  const consolidated = consolidate({
    request,
    fragments: [
      WEBSITE_FRAGMENT,
      {
        source: {
          type: "instagram" as const,
          url: "https://instagram.com/cafeaurora",
          fetchedAt: "2026-09-18T10:30:00.000Z",
          status: "failed" as const,
          reason: "HTTP 403",
        },
      },
    ],
  });

  const manifest = createManifest({
    dossier: consolidated,
    paths,
    executedAt: "2026-09-18T10:30:00.000Z",
    durationMs: 2500,
  });

  assert.equal(manifestSchema.safeParse(manifest).success, true);
  assert.equal(manifest.entitySlug, "cafe-e-bistro-aurora-curitiba");
  assert.equal(manifest.status, "partial");
  assert.equal(manifest.sources.length, 2);

  // Catálogo global
  const catalog = updateCatalog(null, {
    entitySlug: slug,
    name: "Café Aurora",
    lastRunId: runId,
    lastExecutedAt: "2026-09-18T10:30:00.000Z",
    status: "partial",
    version: 1,
    latestDossierJson: paths.latestDossierJson,
    latestMarkdown: paths.latestMarkdown,
    runsCount: 1,
  });

  assert.equal(catalogSchema.safeParse(catalog).success, true);
  assert.equal(catalog.entries.length, 1);
  assert.equal(catalog.entries[0]?.entitySlug, "cafe-e-bistro-aurora-curitiba");
  assert.equal(catalog.entries[0]?.runsCount, 1);

  // Atualização com nova run incrementa runsCount
  const updatedCatalog = updateCatalog(catalog, {
    entitySlug: slug,
    name: "Café Aurora",
    lastRunId: "2026-09-18_12-00-00_999999",
    lastExecutedAt: "2026-09-18T12:00:00.000Z",
    status: "complete",
    version: 2,
    latestDossierJson: paths.latestDossierJson,
    latestMarkdown: paths.latestMarkdown,
    runsCount: 1,
  });
  assert.equal(updatedCatalog.entries.length, 1);
  assert.equal(updatedCatalog.entries[0]?.runsCount, 2);
  assert.equal(updatedCatalog.entries[0]?.version, 2);
  assert.equal(updatedCatalog.entries[0]?.status, "complete");

  const catalogMd = renderCatalogMarkdown(updatedCatalog);
  assert.match(catalogMd, /# Catálogo de Dossiês de Clientes/);
  assert.match(catalogMd, /cafe-e-bistro-aurora-curitiba/);
  assert.match(catalogMd, /🟢 Completo/);
});

process.stdout.write(`\n${checks} checks passaram.\n`);



