# 01 — Visão geral

## O que é este projeto?

O **my-agent** é um **agente de IA** criado com o framework **[eve](https://eve.dev)**. Ele foi inicializado a partir do comando `eve init` e segue o modelo de projeto padrão do eve: um diretório `agent/` contendo toda a definição do agente (identidade, modelo, canais, subagentes e extensões).

## Tipo de aplicação

- **Tipo:** API / serviço (backend serverless)
- **Natureza:** Agente de IA conversacional, exposto por canais HTTP e executável localmente via TUI de desenvolvimento.
- **Deploy:** [Vercel](https://vercel.com) (serverless).

> O projeto **não** é um app Web/Mobile/Desktop tradicional. Ele é um **serviço** que responde a requisições por meio de canais (endpoints) definidos em `agent/channels/`. A interface primária durante o desenvolvimento é o TUI do `eve dev`.

## Objetivo

Fornecer um assistente de IA configurável. A identidade, o propósito, o tom e as diretrizes de resposta do agente são definidos em [`agent/instructions.md`](../agent/instructions.md); o modelo e o comportamento de runtime ficam em [`agent/agent.ts`](../agent/agent.ts).

Além de responder conversas, o agente **delega** a coleta da presença online de um cliente ao subagente
[`client-dossier`](04-arquitetura.md), que emite um dossiê estruturado (dados de negócio, identidade visual, assets e
provenance) para o agente construtor de sites — ver
[`PRD-subagente-dossie-clientes.md`](PRD-subagente-dossie-clientes.md).

## Modelo em uso

O agente está configurado com o modelo:

```
google/gemini-3.8-flash
```

Esse valor está em `agent/agent.ts` e **não deve ser alterado** sem solicitação explícita. O subagente
`client-dossier` declara o mesmo modelo no seu próprio `agent.ts` (subagentes não herdam configuração do raiz).

O projeto usa o **provider direto do Google** (`@ai-sdk/google`): o modelo é declarado como
`google("gemini-3.8-flash")` nos dois `agent.ts` e a credencial é `GOOGLE_GENERATIVE_AI_API_KEY` em `.env.local`.
Para voltar ao Vercel AI Gateway (id no formato `provedor/modelo` + `AI_GATEWAY_API_KEY`/OIDC), veja a "Opção A" em [`09-deploy.md`](09-deploy.md).
A tabela completa de variáveis (gateway, Google e Google Maps) está em [`09-deploy.md`](09-deploy.md).

## Principais pontos

1. Todo o comportamento do agente vive dentro de `agent/`.
2. Mudanças **somente de conteúdo** (identidade, tom, instruções) são feitas em `agent/instructions.md`.
3. Mudanças de **código/capacidades** (tools, canais, skills, subagentes, schedules) são feitas nos arquivos TypeScript sob `agent/`.
4. O build, o dev e o deploy são orquestrados pela CLI `eve`.
5. Subagentes declarados (`agent/subagents/<id>/`) **não herdam** prompt, tools nem sandbox do agente raiz: cada um autora o que precisa.
6. Validações: `npm run typecheck`, `node scripts/check-dossier-lib.mts` (offline) e `npm run eval` (casos em `evals/`).

## Como continuar lendo

- [`02-stack.md`](02-stack.md) — tecnologias e versões.
- [`03-estrutura-do-projeto.md`](03-estrutura-do-projeto.md) — árvore de diretórios.
- [`04-arquitetura.md`](04-arquitetura.md) — como as partes se conectam.
