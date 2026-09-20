# PRD — Subagente de Dossiê de Clientes (`client-dossier`)

> **Status:** Implementado (M1–M3 completos; M4 parcial — ver nota abaixo)
> **Tipo de artefato:** Documento de Requisitos de Produto (PRD)
> **Proprietário:** fluxo "sitemaker" (coleta de dados do cliente → geração de site)
> **Consumidor final:** agente construtor de sites (outro agente, fora do escopo deste documento)
> **Framework:** [eve](https://eve.dev) — implementado como **subagente declarado** sob `agent/subagents/`

## Nota de implementação

Artigos entregues:

| Onde | O quê |
|------|-------|
| `agent/subagents/client-dossier/agent.ts` | Subagente declarado com `description` e `outputSchema` (§8.1, RNF-06) |
| `agent/subagents/client-dossier/instructions.md` | Prompt do especialista (procedimento, provenance, falha parcial, limites) |
| `agent/subagents/client-dossier/lib/` | Schema zod (§7), parsing/HTTP, identidade visual (RF-07), social (RF-06) e consolidação com provenance (RF-09–RF-13) |
| `agent/subagents/client-dossier/tools/` | `fetch_url`, `scrape_page`, `extract_visual_identity`, `download_asset`, `google_places`, `social_profile`, `build_dossier` (§8.2) |
| `evals/client-dossier/` | 7 casos do §11 + `evals.config.ts`; URLs sobrescrevíveis por `DOSSIER_EVAL_*` |
| `scripts/check-dossier-lib.mts` | 13 checks offline do núcleo determinístico (sem rede/modelo) |
| `skills/subagente-client-dossier.md` | Skill operacional do subagente |

Pendências conhecidas: HITL opcional (§9.10) não implementado; `google_places` exige `GOOGLE_MAPS_API_KEY` (§12);
`scrape_page` não executa JavaScript (sinaliza `requiresRendering` em vez de renderizar); os evals do §11 estão autorados e
são descobertos por `eve eval`, mas exigem credenciais de modelo (`AI_GATEWAY_API_KEY` ou `eve link`) para serem graduados.

---

## 1. Contexto e problema

O produto maior (workspace `sitemaker`) constrói um site para um cliente a partir da presença online dele. Antes de gerar qualquer página, é preciso **coletar e normalizar** quem é o cliente, o que ele faz e qual é a sua identidade visual. Hoje essa coleta seria manual e dispersa: o conteúdo está espalhado entre site, Google Maps e redes sociais, em formatos diferentes.

Este PRD especifica um **subagente especializado** (`client-dossier`) que recebe uma lista de links/referências, extrai as informações e a identidade visual, baixa as imagens relevantes e monta um **dossiê** estruturado — que será consumido por um agente posterior para gerar o site.

O problema central resolvido aqui é: **transformar fontes heterogêneas e não estruturadas em um artefato único, estruturado, versionado e rastreável.**

---

## 2. Objetivos e não-objetivos

### Objetivos

1. Receber uma ou mais referências de fontes (site, Google Maps, redes sociais).
2. Extrair **informações de negócio** estruturadas (nome, contato, serviços, horários etc.).
3. Extrair a **identidade visual** (cores, tipografia, logo, favicon).
4. Baixar/coletar **imagens** (logo, fotos, imagens de capa) para armazenamento local.
5. Consolidar e **deduplicar** as informações, mantendo a **origem de cada dado** (provenance).
6. Emitir um **dossiê** com esquema fixo (validado) pronto para o agente construtor de sites.
7. Ser um subagente **delegável** pelo agente raiz (roda em background, retorno estruturado).

### Não-objetivos

- **Não** gera o site (responsabilidade de outro agente).
- **Não** publica, hospeda ou serve os assets coletados.
- **Não** faz contato/comunicação com o cliente.
- **Não** modifica as fontes de origem.
- **Não** faz enriquecimento com dados pagos (ex.: crédito, prospecção) nesta fase.

---

## 3. Atores / personas

| Ator | Papel |
|------|-------|
| **Agente raiz** (orquestrador) | Delega a coleta ao `client-dossier` e repassa o dossiê ao agente de site. |
| **Subagente `client-dossier`** | Executa a coleta, extração, identidade visual e montagem do dossiê. |
| **Agente construtor de sites** | Consome o dossiê (consumidor downstream, fora do escopo). |
| **Usuário humano (opcional)** | Revisa/aprova o dossiê (Human-in-the-Loop), se habilitado. |

---

## 4. Escopo

### Dentro do escopo

- Ingestão e validação de links/referências.
- Busca de conteúdo (HTML, APIs e, quando necessário, renderização de páginas JS).
- Extração de dados de negócio, Google Maps/Places e redes sociais.
- Extração de identidade visual e download de assets.
- Consolidação com deduplicação e provenance.
- Emissão do dossiê + manifesto de assets + índice de fontes.

### Fora do escopo

- Geração do site, domínios/DNS, deploy, pagamentos.
- Monitoramento contínuo / sincronização periódica.
- Autenticação em redes sociais fechadas (ex.: conteúdo atrás de login).

---

## 5. Requisitos funcionais (RF)

| ID | Requisito |
|----|-----------|
| RF-01 | Receber uma requisição contendo uma lista de fontes, cada uma com `type` e `url` (e `hint`/`clientId` opcionais). |
| RF-02 | Normalizar e validar URLs (esquema, domínio, canonical, redirecionamentos). |
| RF-03 | Buscar o conteúdo de cada fonte (HTTP/API; fallback para renderização de páginas com JS). |
| RF-04 | Extrair **dados de negócio**: nome, categoria, descrição, tagline, serviços, áreas de atuação, telefone, e-mail, endereço, horários, site. |
| RF-05 | Extrair **dados de Google Maps/Places**: categoria, avaliação, nº de avaliações, horários, telefone, site, fotos. |
| RF-06 | Extrair **dados de redes sociais**: handle, bio, URL, seguidores, posts relevantes, links (ex.: Linktree). |
| RF-07 | Extrair a **identidade visual**: cores (papel + hex), tipografia (papel + família), logo, favicon. |
| RF-08 | Baixar **imagens** (logo, fotos, `og:image`, capa) para o workspace/sandbox e referenciá-las por caminho local. |
| RF-09 | **Consolidar** os dados de múltiplas fontes com deduplicação e resolução de conflito (prioridade por fonte + nível de confiança). |
| RF-10 | Registrar a **origem** de cada campo (fonte, URL, momento da coleta, status). |
| RF-11 | **Sinalizar** campos ausentes ou de baixa confiança (para o orquestrador decidir se completa com o humano). |
| RF-12 | Emitir o dossiê em **esquema estruturado** (validado) + manifesto de assets + índice de fontes. |
| RF-13 | Retornar **sucesso parcial** quando alguma fonte falhar (não derrubar a coleta inteira). |

---

## 6. Requisitos não-funcionais (RNF)

| ID | Requisito |
|----|-----------|
| RNF-01 | **Confiabilidade:** tratar timeouts, HTTP 403/429, anti-bot e rate limits com retry/backoff. |
| RNF-02 | **Desempenho:** buscar fontes em paralelo (o subagente roda em background; a coleta é uma "coorte"). |
| RNF-03 | **Segurança:** execução em sandbox; sem vazar segredos; respeitar rate limits e `robots.txt`/ToS. |
| RNF-04 | **Rastreabilidade:** todo campo do dossiê deve apontar para a fonte que o originou. |
| RNF-05 | **Conformidade:** respeitar direitos autorais (imagens) e privacidade (LGPD/GDPR) — ver §12. |
| RNF-06 | **Determinismo de contrato:** o esquema de saída é fixo e validado (zod), consumível pelo agente de site. |
| RNF-07 | **Idempotência:** reexecução de uma mesma fonte/URL não deve duplicar assets nem dados. |

---

## 7. Contratos de entrada e saída

### 7.1 Entrada (mensagem para o subagente)

O agente raiz transfere os dados pelo campo `message` (ou via `outputSchema`). Formato sugerido (serializado):

```ts
type DossierRequest = {
  clientId?: string;
  name?: string; // dica de nome (opcional)
  sources: DossierSource[];
};

type DossierSource = {
  type: "website" | "google_maps" | "instagram" | "facebook"
      | "linkedin" | "tiktok" | "youtube" | "other";
  url: string;
  hint?: string;
};
```

### 7.2 Saída (o dossiê)

O dossiê é o contrato consumido pelo agente de site. Estrutura mínima proposta:

```ts
type Dossier = {
  meta: {
    id: string;
    clientId?: string;
    createdAt: string;
    version: number;
    status: "complete" | "partial";
    sourcesCount: number;
  };

  business: {
    name?: string;
    legalName?: string;
    category?: string;
    description?: string;
    tagline?: string;
    services?: string[];
    serviceAreas?: string[];
    contact: {
      phone?: string;
      email?: string;
      website?: string;
      address?: string;
      hours?: string[];
    };
  };

  social: Array<{
    platform: string;
    handle?: string;
    url: string;
    bio?: string;
    followers?: number;
  }>;

  maps?: {
    placeId?: string;
    rating?: number;
    reviewCount?: number;
    category?: string;
    hours?: string[];
    photosCount?: number;
  };

  visualIdentity: {
    colors: Array<{ role: "primary" | "secondary" | "accent" | "background" | "text"; hex: string; source: string }>;
    typography: Array<{ role: "heading" | "body"; family: string; source: string }>;
    logo?: { url: string; localPath?: string; format?: string };
    favicon?: { url: string; localPath?: string };
  };

  assets: Array<{
    id: string;
    kind: "logo" | "photo" | "cover" | "favicon" | "other";
    url: string;
    localPath?: string;
    alt?: string;
    source: string;
  }>;

  confidence: Array<{ field: string; level: "high" | "medium" | "low"; source: string; note?: string }>;
  missing: Array<{ field: string; reason: string }>;
  sources: Array<{ type: string; url: string; fetchedAt: string; status: "ok" | "partial" | "failed"; title?: string }>;
};
```

> O esquema real deve ser expresso com **zod** (já usado no projeto) e exposto como `outputSchema` do subagente, garantindo que o agente de site receba sempre a mesma forma.

---

## 8. Arquitetura no eve

### 8.1 Localização e forma

Subagente **declarado** (a localização sob `subagents/` é o que o marca como subagente):

```
agent/subagents/client-dossier/
├── agent.ts            # defineAgent({ description, model }) — description é obrigatória
├── instructions.md     # identidade/prompt do especialista (o que extrair, como consolidar)
├── tools/              # capacidades tipadas (fetch, parse, extração, download, consolidação)
├── connections/        # APIs externas (Google Places, redes) via HTTP/MCP
├── sandbox.ts          # sandbox (rede + sistema de arquivos) para baixar assets
└── (opcional) skills/  # procedimentos específicos que o subagente carrega sob demanda
```

Regras confirmadas na doc do eve (`node_modules/eve/docs/subagents/`):

- `description` é **obrigatória** — é o que o agente raiz lê para decidir delegar.
- O subagente roda como **tarefa em background**: a chamada retorna `{ status: "working", taskId, agentId }` e notificações acordam o pai na conclusão.
- O pai transfere dados pelo campo `message`; o retorno estruturado é feito via `outputSchema`.
- O subagente não recebe a tool `agent` (root-only) e tem superfície de tools própria.

### 8.2 Capacidades (tools) candidatas

| Tool | Responsabilidade |
|------|------------------|
| `fetch_url` | HTTP GET + parse do conteúdo (HTML/JSON). |
| `scrape_page` | Renderização de páginas JS (browser) quando o HTML puro é insuficiente. |
| `google_places` | Dados do Google Maps/Places via API/MCP (categoria, rating, fotos, horários). |
| `social_profile` | Perfil de rede social via API/MCP (bio, handle, seguidores). |
| `extract_visual_identity` | Extrai cores, tipografia, logo e favicon a partir do HTML/CSS/assets. |
| `download_asset` | Baixa imagem para o workspace/sandbox e devolve o caminho local. |
| `build_dossier` | Consolida, deduplica, valida e emite o dossiê final (schema). |

### 8.3 Integrações existentes (preferir antes de codar)

Seguindo a regra do repositório (`AGENTS.md` → "Prefer an existing integration"), **antes** de implementar do zero, buscar no registry:

```sh
eve registry search google maps --json
eve registry search scrape --json
eve registry search instagram --json
eve registry search <rede> --json
```

- Preferir itens com `implementation: native`.
- Usar adaptadores Chat SDK/MCP quando não houver integração nativa.
- Instalar sem prompt interativo: `eve add <item> --non-interactive`.
- Para capacidade **genérica** (ex.: extrair cores/fontes de uma página), autorar uma **tool** própria em vez de integração.

### 8.4 Delegação e orquestração

1. O agente raiz recebe os links do usuário e monta o `DossierRequest`.
2. Chama a tool do subagente `client-dossier` com o `message` (request serializado).
3. O subagente roda em background; o pai é acordado com a conclusão.
4. O dossiê é entregue ao pai, que o repassa ao agente de site.

---

## 9. Fluxo de processamento

1. **Receber** o `DossierRequest`.
2. **Normalizar/validar** URLs (esquema, canonical, redirects).
3. **Buscar** as fontes em paralelo, com retry/backoff e rate limiting.
4. **Extrair** dados por fonte (negócio, maps, redes).
5. **Baixar** assets (logo, fotos, `og:image`).
6. **Extrair** identidade visual (cores, fontes, logo, favicon).
7. **Consolidar** com deduplicação, resolução de conflito e provenance.
8. **Validar** contra o esquema (zod).
9. **Emitir** dossiê + manifesto de assets + índice de fontes.
10. **(Opcional)** HITL para aprovação do dossiê antes de seguir para o site.

---

## 10. Critérios de aceite (Definition of Done)

Dado um cliente com site + Instagram + ficha no Google Maps:

- [ ] O dossiê retorna preenchidos os campos esperados (negócio, contato, social, maps).
- [ ] Todo campo preenchido possui **fonte** e **nível de confiança** (provenance).
- [ ] A identidade visual foi extraída (cores com papel, tipografia, logo/favicon).
- [ ] Os assets foram baixados e referenciados por **caminho local** (não só URL externa).
- [ ] O esquema de saída **valida** e é consumível pelo agente de site.
- [ ] A falha de uma fonte **não** derruba a coleta (retorna `status: "partial"` + `missing[]`).
- [ ] Passa nos **evals** definidos (ver §11).

---

## 11. Evals / testes

Casos de teste (com fontes conhecidas e saídas esperadas):

| Caso | Entrada | Assertiva principal |
|------|---------|---------------------|
| Só website | 1× `website` | Negócio + identidade visual + assets extraídos. |
| Só Google Maps | 1× `google_maps` | Categoria, rating, horários, fotos extraídos. |
| Só Instagram | 1× `instagram` | Handle, bio, seguidores, links extraídos. |
| Misto | website + maps + instagram | Consolidação sem duplicidade; campos com provenance. |
| Fonte quebrada | URL com 404/403 | `status: "partial"`, campo em `missing[]`, demais fontes OK. |
| Site sem logo | website sem logo/favicon | `visualIdentity.logo` ausente + `missing[]` sinalizado. |
| Redirect | URL que redireciona | URL final resolvida e registrada em `sources[]`. |

Ferramenta de validação: `npm run eval` (eve evals), além do `npm run typecheck` para o schema.

Como o subagente roda como tarefa de background, cada caso é observado em três partes (helper `runDossier` em
`evals/client-dossier/sources.ts`): turno do pai (só aceita a delegação) → **turno de entrega** (`watchTurn`, traz a
notificação com o dossiê e o `childSessionId`) → **sessão filha** (`attachSession`, onde as tools de coleta aparecem).
As assertivas de `calledTool` são feitas na sessão filha e o dossiê entregue é validado com `matches(dossierSchema)`
(RNF-06). As fixtures precisam ser leves: o stream do cliente fecha após ~100s sem eventos, então uma fonte que faça o
filho demorar mais que isso derruba o caso (aponte outra URL em `DOSSIER_EVAL_*` se necessário).

---

## 12. Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| **Scraping / ToS / anti-bot** | Preferir APIs/MCP oficiais; respeitar rate limits e `robots.txt`; fallback documentado. |
| **Copyright de imagens** | Registrar fonte/licença de cada asset; não reutilizar sem checagem. |
| **Privacidade (LGPD/GDPR)** | Não persistir dados pessoais além do necessário; marcar campos sensíveis; minimizar retenção. |
| **Alucinação do modelo** | Exigir provenance por campo; marcar baixa confiança; nunca inventar dado sem fonte. |
| **Páginas JS-heavy** | Fallback para renderização (tool `scrape_page`). |
| **Custo/latência** | Paralelizar; cache por URL; limitar nº de fontes por requisição. |
| **Fontes divergentes** | Política de prioridade explícita (site > Google Maps > rede) + registro do conflito. |

---

## 13. Fora de escopo / evolução futura

- Geração do site (outro agente).
- Enriquecimento com dados pagos (crédito, prospecção).
- Monitoramento contínuo / sincronização periódica do dossiê.
- Integração com CRM/gestão de leads.

---

## 14. Milestones sugeridos

| Fase | Entrega |
|------|---------|
| **M1** | Subagente `client-dossier` + tool de fetch + extração básica (website) + schema do dossiê. |
| **M2** | Integração Google Maps/Places + redes sociais. |
| **M3** | Extração de identidade visual + download de assets. |
| **M4** | Consolidação/provenance + evals + HITL opcional. |

---

## 15. Glossário

| Termo | Definição |
|-------|-----------|
| **Dossiê** | Artefato estruturado com informações de negócio, identidade visual e assets de um cliente. |
| **Identidade visual** | Cores, tipografia, logo e favicon que definem a marca. |
| **Asset** | Imagem coletada (logo, foto, capa) baixada para armazenamento local. |
| **Provenance** | Rastreabilidade da origem de cada campo do dossiê (fonte + URL + status). |
| **Subagente declarado** | Agente especializado sob `agent/subagents/<id>/`, com prompt/tools/sandbox próprios. |
