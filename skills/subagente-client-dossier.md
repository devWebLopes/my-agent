# Skill: Subagente de dossiê de clientes

> **Categoria:** Habilidade técnica
> **Nível:** Avançado
> **Áreas do projeto:** `agent/subagents/client-dossier/`, `agent/instructions.md`, `evals/client-dossier/`
> **Skills relacionadas:** [Operar o framework eve](framework-eve.md), [Registry e integrações](registry-e-integracoes.md), [Validação e scripts](validacao-e-scripts.md)
> **Docs:** [`PRD-subagente-dossie-clientes.md`](../docs/PRD-subagente-dossie-clientes.md), [`04-arquitetura.md`](../docs/04-arquitetura.md)

## Resumo

O subagente `client-dossier` recebe um `DossierRequest` (lista de fontes: site, Google Maps, redes sociais) e devolve um
**dossiê estruturado** (`Dossier`): dados de negócio, contato, redes, Google Maps, identidade visual, assets baixados
localmente, provenance por campo, campos ausentes e índice de fontes. É o artefato consumido pelo agente que gera o site.

## Estrutura

| Arquivo | Papel |
|---------|-------|
| `agent.ts` | `defineAgent({ description, model, outputSchema })` — `description` é obrigatória e `outputSchema` é o contrato do dossiê. |
| `instructions.md` | Prompt do especialista: roteamento de tools, regras de provenance, falha parcial e limitações. |
| `lib/schema.ts` | Schemas zod (request, fragmentos por fonte e dossiê final) + helpers de parsing. É o único módulo com zod em runtime. |
| `lib/html.ts` / `lib/url.ts` / `lib/http.ts` | Parsing de HTML, normalização de URLs e camada HTTP (timeout, retry, `robots.txt`, cache). |
| `lib/visual-identity.ts` / `lib/social.ts` | Extração de cores/tipografia/logo/favicon e de perfis sociais. |
| `lib/consolidate.ts` / `lib/markdown.ts` | Deduplicação, conflito por prioridade, provenance e render do `dossie.md`. |
| `tools/*.ts` | `fetch_url`, `scrape_page`, `extract_visual_identity`, `download_asset`, `google_places`, `social_profile`, `build_dossier`. |

## Contrato

Entrada (no `message` da delegação, JSON):

```json
{ "clientId": "cafe-aurora", "name": "Café Aurora", "sources": [{ "type": "website", "url": "https://…" }] }
```

Saída: o `Dossier` (schema zod) — gravado de forma isolada e rastreável em `dossiers/<slug-pesquisado>/runs/<runId>/dossier.json`, `dossiers/<slug-pesquisado>/runs/<runId>/dossie.md`, `dossiers/<slug-pesquisado>/runs/<runId>/manifest.json`, no ponteiro `dossiers/<slug-pesquisado>/latest/` e indexado em `dossiers/catalog.json`.

## Procedimento

1. O agente raiz classifica as URLs (`website`, `google_maps`, `instagram`, …) e delega ao subagente `client-dossier`.
2. O subagente coleta cada fonte com a tool correspondente, na ordem: dados → identidade visual → assets.
3. Cada tool de fonte devolve um `fragment` pronto (`{ source, business?, maps?, social?, visualIdentity?, assets?, missing? }`) — exceto `fetch_url` e `scrape_page`, que devolvem só a coleta crua; nesse caso o fragmento do site sai do `fragment` do `extract_visual_identity` + os campos derivados.
4. O subagente deriva campos de negócio apenas do que as tools devolveram, sempre como `{ value, source, confidence }`.
5. `build_dossier` consolida, resolve conflito (site > Google Maps > rede), valida com zod, grava os arquivos e devolve o dossiê.
6. O subagente responde exatamente com o dossiê (sem prosa) e o raiz reporta `meta.status` e `missing[]`.

## Armadilhas

- **Não invente dados.** Campo sem evidência vai para `missing[]`; todo valor precisa de `source` e `confidence`.
- **Não troque a ordem de evidência** das cores (variável CSS > `meta[theme-color]` > frequência) sem atualizar os testes.
- **`GOOGLE_MAPS_API_KEY`**: sem ela, `google_places` retorna `ok:false` e `maps` deve constar em `missing[]` — nunca simule a ficha.
- **`scrape_page` não executa JavaScript.** Quando `requiresRendering` for true, registre a limitação.
- **Segredos não entram no contexto**: URLs de fotos do Places usam `{GOOGLE_MAPS_API_KEY}`, substituído apenas dentro de `download_asset`.
- **Não varra o site inteiro**: colete as fontes pedidas e no máximo os links sociais descobertas nelas (limite de 10 fontes por request).
- Ao adicionar tool nova, mantenha os nomes distintos dos nomes de tools built-in (`bash`, `read_file`, `web_fetch`, …).
- Um subagente declarado **não herda** tools/sandbox do raiz — tudo o que ele usa vive sob `agent/subagents/client-dossier/`.
- **`source.fetchedAt` é opcional no fragmento** (o `build_dossier` carimba): o modelo nunca precisa inventar timestamp; sem isso o fragmento do site falhava a validação.
- **Evals e background task**: `calledTool` do eval só enxerga o que roda na sessão observada. Como o subagente roda em background, as tools de coleta aparecem na **sessão filha** (`run.child.calledTool(...)`, via helper `runDossier`); o run do pai só tem a tool `client-dossier`. Fixtures lentas estouram a janela do stream do turno de entrega.

## Validação

```sh
npm run typecheck               # schema + libs + tools + evals
node scripts/check-dossier-lib.mts   # checks offline da lógica determinística (sem rede/modelo)
npm run build                   # confere descoberta do subagente e binding das tools
npm run eval client-dossier     # casos do PRD §11 (exige rede + credenciais do modelo)
```

## Fora do escopo desta implementação (PRD §13)

- **HITL para aprovação do dossiê** (PRD §9.10): opcional e responsabilidade do fluxo do orquestrador; hoje o subagente
  entrega o dossiê direto. Para habilitar, use as ferramentas de human-in-the-loop do eve no agente raiz.
- **Enriquecimento pago** (crédito/prospecção) e **integrações de scraping gerenciado**: o registry não tem item nativo
  para Google Maps/Instagram (as opções são skills de terceiros com API key paga ou `connection/context`). Se houver
  orçamento/credenciais, instale com `eve add <item> --non-interactive` e ligue no lugar das tools próprias.
- **Renderização de páginas JS**: `scrape_page` não executa JavaScript; um browser headless (ou um serviço de scraping)
  pode substituir esse fallback quando `requiresRendering` aparecer com frequência.

## Referências

- [`docs/PRD-subagente-dossie-clientes.md`](../docs/PRD-subagente-dossie-clientes.md)
- eve docs (subagents): <https://eve.dev/docs>
