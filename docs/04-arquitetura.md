# 04 — Arquitetura

## Visão geral

O projeto segue a arquitetura padrão do framework **eve**: um agente é definido como um conjunto de arquivos dentro do diretório `agent/`, e a CLI `eve` se encarrega de compilar e executar esse agente.

```
┌─────────────────────────────────────────────┐
│                  agent/                     │
│                                             │
│  agent.ts (modelo + runtime)                │
│  instructions.md (identidade/tom)           │
│                                             │
│  channels/                                  │
│    └── eve.ts  (HTTP + auth)                │
│                                             │
│  subagents/                                 │
│    ├── self-modification/                   │
│    │    ├── agent.ts                        │
│    │    ├── config.ts                       │
│    │    ├── sandbox.ts                      │
│    │    └── extensions/selfmod.ts           │
│    └── client-dossier/                      │
│         ├── agent.ts (description+schema)   │
│         ├── instructions.md                 │
│         ├── lib/ (schema, html, http, …)    │
│         └── tools/ (fontes + build_dossier) │
└─────────────────────────────────────────────┘
          │ compilado e executado por
          ▼
        eve CLI  ──►  Vercel (produção)
                  ──►  TUI local (desenvolvimento)
```

## Componentes principais

### 1. Agente raiz

Definido em `agent/agent.ts` via `defineAgent`. É o ponto de entrada do agente e onde ficam o modelo e o comportamento de runtime.

### 2. Instruções (`instructions.md`)

Separadas do código. Contêm a identidade, o propósito, o tom e as diretrizes de resposta. Permitem ajustar o comportamento conversacional **sem tocar em código**.

### 3. Canais (`channels/`)

Definem **como** o agente é acessado (HTTP/endpoints) e **quem** pode acessá-lo (autenticação). Cada arquivo em `channels/` exporta um canal (neste caso, `eveChannel`).

### 4. Subagentes (`subagents/`)

Agentes especializados que **não herdam** o prompt, as tools nem a sandbox do raiz. O projeto inclui:

- **self-modification** — dá ao agente a capacidade de modificar a si mesmo de forma controlada (config e sandbox próprias).
- **client-dossier** — coleta a presença online de um cliente (site, Google Maps, redes sociais) e emite um **dossiê
  estruturado** validado por zod (`outputSchema`), com provenance por campo, assets baixados localmente e lista de campos
  ausentes. É o artefato consumido pelo agente construtor de sites.

### 5. Extensões (`extensions/`)

Dentro de um subagente, as extensões expõem recursos específicos. `extensions/selfmod.ts` conecta o recurso de auto-modificação ao subagente.

### 6. Avaliações (`evals/`)

Fora de `agent/`, os arquivos `*.eval.ts` descrevem casos de teste que conversam com o agente real (`npm run eval`). O
diretório `evals/client-dossier/` cobre os casos do PRD do dossiê (só website, só Maps, só Instagram, misto, fonte
quebrada, site sem logo e redirect).

Como o subagente declarado roda como **tarefa de background**, um caso do §11 tem três partes (helper `runDossier` em
`evals/client-dossier/sources.ts`):

1. o turno do pai termina assim que a delegação é aceita (`{ status: "working" }`) — não há dossiê nele;
2. `t.target.watchTurn(sessionId, { startIndex })` consome o **turno de entrega**, onde eve acorda o pai com a
   notificação de conclusão (que carrega o JSON do dossiê) e emite `subagent.called` com o `childSessionId`;
3. `t.target.attachSession(childSessionId)` anexa a sessão filha, que é onde as tools de coleta
   (`fetch_url`, `extract_visual_identity`, `build_dossier`, …) realmente aparecem.

Consequências práticas:

- assertivas de tool (`calledTool`) precisam ser feitas **na sessão filha** (`run.child.calledTool(...)`); no run do pai
  só existe a tool `client-dossier`;
- o turno de entrega só chega quando o filho termina: mantenha as fixtures **leves** (o stream do cliente fecha após
  ~100s sem eventos) e deixe a fonte lenta de fora, ou aponte por `DOSSIER_EVAL_*`;
- o dossiê entregue é validado contra o `dossierSchema` do próprio agente (`matches(dossierSchema)`), o que cobre o
  RNF-06 dentro do eval de integração.

## Fluxo de execução (alto nível)

1. A CLI `eve` descobre os arquivos sob `agent/`.
2. Compila o agente (TypeScript) e resolve canais, subagentes e extensões.
3. Em desenvolvimento, sobe um servidor local + TUI (`eve dev`).
4. Em produção, deploya para a Vercel (`eve deploy`).

## Fluxo de delegação do dossiê (client-dossier)

```
usuário ──links──► agente raiz ──DossierRequest (message)──► subagente client-dossier
                                                              │
              fetch_url / scrape_page / extract_visual_identity ┤ (website)
              google_places                                     │ (maps)
              social_profile                                    │ (redes)
              download_asset                                    │ (imagens → /workspace/assets)
                                                              ▼
                                                    build_dossier (zod) ──► dossier.json + dossie.md
                                                              │
agente raiz ◄────────── dossiê (outputSchema) ────────────────┘
```

- O subagente roda como **tarefa em background**: a chamada devolve `{ status: "working", taskId, agentId }` e o raiz é
  acordado na conclusão.
- Falha de uma fonte **não** derruba a coleta: o dossiê sai com `meta.status: "partial"` e a lista `missing[]`.

## Princípio de separação

- **Conteúdo** (o que o agente *diz* e como se comporta na conversa) → `instructions.md`.
- **Código** (o que o agente *pode fazer*: tools, canais, subagentes, skills, schedules) → arquivos `.ts` sob `agent/`.

Essa separação permite evoluir o tom do agente sem riscos de regressão em código, e vice-versa.
