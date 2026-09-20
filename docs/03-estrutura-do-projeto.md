# 03 — Estrutura do projeto

## Árvore de diretórios

```
my-agent/
├── .eve/                      # Estado local do eve (build, logs, traces). NÃO editar.
├── .git/                      # Repositório Git.
├── agent/                     # Toda a definição do agente.
│   ├── agent.ts               # Configuração do agente (modelo, runtime).
│   ├── instructions.md        # Identidade, propósito, tom e diretrizes de resposta.
│   ├── channels/
│   │   └── eve.ts             # Canal de comunicação + autenticação.
│   └── subagents/
│       ├── self-modification/
│       │   ├── agent.ts       # Definição do subagente de auto-modificação.
│       │   ├── config.ts      # Configuração do subagente.
│       │   ├── sandbox.ts     # Sandbox do subagente.
│       │   └── extensions/
│       │       └── selfmod.ts # Extensão que expõe o recurso de auto-modificação.
│       └── client-dossier/    # Subagente de dossiê de clientes (PRD dedicado).
│           ├── agent.ts       # defineAgent({ description, model, outputSchema }).
│           ├── instructions.md# Prompt do especialista (provenance, falha parcial, limites).
│           ├── lib/           # Lógica pura: schema zod, HTML, HTTP, identidade visual,
│           │                  # social, consolidação e render do dossiê em Markdown.
│           └── tools/         # fetch_url, scrape_page, extract_visual_identity,
├── dossiers/                  # Dossiês organizados por entidade e consulta (PRD dedicado).
│   ├── catalog.json           # Catálogo central indexado de todas as pesquisas.
│   ├── README.md              # Sumário legível com o histórico de consultas.
│   └── <slug-pesquisa>/       # Pasta por entidade com latest/ e runs/ (dossier.json, dossie.md, manifest.json, assets/).
├── evals/                     # Avaliações do eve (`npm run eval`).
│   ├── evals.config.ts        # Configuração compartilhada (concorrência/timeout).
│   └── client-dossier/        # Casos do PRD §11 + fixtures compartilhadas.
├── scripts/                   # Scripts de apoio fora do runtime do eve.
│   └── check-dossier-lib.mts  # Checks offline do núcleo determinístico do dossiê.
├── docs/                      # Esta documentação.
├── node_modules/              # Dependências. NÃO editar.
├── .gitignore                 # Arquivos ignorados pelo Git.
├── .vercelignore              # Arquivos ignorados no deploy da Vercel.
├── AGENTS.md                  # Instruções para agentes de IA que trabalham no repo.
├── CLAUDE.md                  # Aponta para AGENTS.md (@AGENTS.md).
├── env.local                  # Variáveis de ambiente locais (não versionado por .gitignore .env*).
├── package.json               # Dependências, scripts e atalhos de import.
├── package-lock.json          # Lockfile de dependências.
├── tsconfig.json              # Configuração do TypeScript.
└── README.md                  # README raiz (início rápido).
```

## Responsabilidade de cada arquivo

### `agent/agent.ts`

Define o agente raiz via `defineAgent` do eve. Neste projeto, apenas configura o modelo:

```ts
import { google } from "@ai-sdk/google";
import { defineAgent } from "eve";

export default defineAgent({
  model: google("gemini-3.8-flash"),
});
```

**Preserve este arquivo** a menos que o usuário peça para trocar o modelo.

### `agent/instructions.md`

Contém a identidade do agente. É o arquivo a ser editado para mudanças **somente de conteúdo** (identidade, propósito, tom e diretrizes de resposta).

### `agent/channels/eve.ts`

Define o canal de comunicação do agente e sua autenticação. Atualmente usa:

- `vercelOidc()` — permite que o TUI do eve e os deploys na Vercel acessem o agente.
- `localDev()` — abre o agente em `localhost` para `eve dev` e REPL (ignorado em produção).
- `placeholderAuth()` — placeholder que **não** permite requisições de navegador em produção. Deve ser substituído pelo provedor de auth da aplicação (ex.: Auth.js, Clerk) ou por `none()` para uma demo pública.

### `agent/subagents/self-modification/`

Subagente responsável pela capacidade de **auto-modificação** do agente. É composto por:

- `agent.ts` — `defineSelfModificationAgent`.
- `config.ts` — `defineSelfModificationConfig` (habilita `local`).
- `sandbox.ts` — `defineSelfModificationSandbox`.
- `extensions/selfmod.ts` — expõe o recurso via `selfModification(config)`.

### `agent/subagents/client-dossier/`

Subagente responsável por **coletar a presença online do cliente e emitir o dossiê** (ver
[`PRD-subagente-dossie-clientes.md`](PRD-subagente-dossie-clientes.md)). É composto por:

- `agent.ts` — `defineAgent({ description, model, outputSchema })`; `description` é obrigatória e `outputSchema` é o
  contrato do dossiê (validado por zod em `lib/schema.ts`).
- `instructions.md` — prompt do especialista: roteamento de tools, regras de provenance, falha parcial e limitações.
- `lib/` — lógica pura e testável: `schema.ts` (zod), `html.ts`, `url.ts`, `http.ts`, `visual-identity.ts`, `social.ts`,
  `consolidate.ts`, `markdown.ts`. Só `schema.ts` usa zod em runtime; os demais importam apenas tipos.
- `tools/` — `fetch_url`, `scrape_page`, `extract_visual_identity`, `download_asset`, `google_places`,
  `social_profile` e `build_dossier`.

Contrato de entrada (campo `message` da delegação):

```json
{ "clientId": "cafe-aurora", "name": "Café Aurora", "sources": [{ "type": "website", "url": "https://…" }] }
```

Saída: o dossiê estruturado, também gravado no sandbox em `dossiers/<id>/dossier.json` e `dossiers/<id>/dossie.md`.

### `evals/`

Avaliações executadas por `npm run eval` (`eve eval`). `evals/evals.config.ts` centraliza concorrência e timeout;
`evals/client-dossier/` contém os casos do PRD §11 (só website, só Maps, só Instagram, misto, fonte quebrada, site sem
logo e redirect), com as URLs em `sources.ts` (sobrescrevíveis por variáveis `DOSSIER_EVAL_*`).

### `scripts/`

Scripts de apoio que rodam fora do runtime do eve. `scripts/check-dossier-lib.mts` valida offline o núcleo
determinístico do dossiê (parsing, identidade visual, social, consolidação e Markdown) com o type-stripping do Node 24:

```sh
node scripts/check-dossier-lib.mts
```

## Arquivos de configuração de agente (`AGENTS.md` / `CLAUDE.md`)

- `AGENTS.md` contém as regras de trabalho neste repositório (documentação primeiro, preferir integrações existentes, validar mudanças, etc.).
- `CLAUDE.md` simplesmente importa `AGENTS.md` (`@AGENTS.md`).

## Diretórios gerados / ignorados

- `.eve/` — estado local do eve (build, cache, logs, traces, snapshots). Está no `.gitignore`.
- `node_modules/` — dependências. Está no `.gitignore` e no `.vercelignore`.
- `env.local` — variáveis locais; o padrão `.env*` no `.gitignore` evita versionar segredos.
